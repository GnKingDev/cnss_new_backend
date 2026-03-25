/**
 * Service de gestion des sessions employeur (Redis).
 * - Session = user:<userId> avec TTL 30 min
 * - OTP login = otp:login:<userId> avec TTL 5 min
 * - Blacklist tokens (optionnel) = blacklist:<token>
 * - Si Redis est en lecture seule (replica), repli en mémoire pour les sessions.
 */
const { client: redisClient, isRedisConnected } = require('../redis.connect');

const SESSION_TTL = 1800;  // 30 minutes
const OTP_LOGIN_TTL = 300; // 5 minutes
const SESSION_PREFIX = 'user:';
const OTP_LOGIN_PREFIX = 'otp:login:';
const BLACKLIST_PREFIX = 'blacklist:';
// Affiliation volontaire (séparé du portail employeur)
const AV_SESSION_PREFIX = 'av:user:';
const AV_OTP_LOGIN_PREFIX = 'av:otp:login:';
/** Déclaration automatique par mois : av:declaration:auto:{affiliationId}:{year}:{periode} = 1, TTL 400 j */
const AV_DECLARATION_AUTO_PREFIX = 'av:declaration:auto:';
const AV_DECLARATION_AUTO_TTL = 400 * 24 * 3600; // 400 jours

// Repli en mémoire quand Redis refuse les écritures (ex: replica read-only)
const memorySessions = new Map(); // userId -> expirationTimestamp
const MEMORY_SESSION_TTL_MS = SESSION_TTL * 1000;

function pruneMemorySessions() {
  const now = Date.now();
  for (const [userId, exp] of memorySessions.entries()) {
    if (exp <= now) memorySessions.delete(userId);
  }
}

const sessionService = {
  /** Vérifie si Redis est disponible pour les sessions */
  isAvailable: () => isRedisConnected(),

  /** Crée ou renouvelle la session employeur */
  create: async (userId) => {
    if (isRedisConnected()) {
      try {
        await redisClient.set(`${SESSION_PREFIX}${userId}`, '1', 'EX', SESSION_TTL);
        return;
      } catch (err) {
        console.error('[session] create error:', err.message);
        if (!/READONLY|read only/i.test(err.message)) return;
        // Redis en lecture seule (replica) : utiliser le repli mémoire
      }
    }
    memorySessions.set(userId, Date.now() + MEMORY_SESSION_TTL_MS);
  },

  /** Vérifie si une session existe */
  get: async (userId) => {
    pruneMemorySessions();
    const memExp = memorySessions.get(userId);
    if (memExp != null && memExp > Date.now()) return '1';
    if (!isRedisConnected()) return null;
    try {
      return await redisClient.get(`${SESSION_PREFIX}${userId}`);
    } catch (err) {
      console.error('[session] get error:', err.message);
      return null;
    }
  },

  /** Supprime la session (déconnexion) */
  delete: async (userId) => {
    memorySessions.delete(userId);
    if (!isRedisConnected()) return 1;
    try {
      return await redisClient.del(`${SESSION_PREFIX}${userId}`);
    } catch (err) {
      console.error('[session] delete error:', err.message);
      return 0;
    }
  },

  /** Stocke l'OTP de login (pour verify_otp) */
  setLoginOtp: async (userId, code) => {
    if (!isRedisConnected()) return;
    try {
      await redisClient.set(`${OTP_LOGIN_PREFIX}${userId}`, String(code), 'EX', OTP_LOGIN_TTL);
    } catch (err) {
      console.error('[session] setLoginOtp error:', err.message);
    }
  },

  /** Vérifie et consomme l'OTP de login (usage unique) */
  checkLoginOtp: async (userId, code) => {
    if (!isRedisConnected()) return false;
    try {
      const key = `${OTP_LOGIN_PREFIX}${userId}`;
      const stored = await redisClient.get(key);
      if (stored !== String(code)) return false;
      await redisClient.del(key);
      return true;
    } catch (err) {
      console.error('[session] checkLoginOtp error:', err.message);
      return false;
    }
  },

  /** Ajoute un token à la blacklist (invalidation) */
  blacklistToken: async (token) => {
    if (!isRedisConnected()) return;
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(token);
      if (!decoded?.exp) return;
      const ttl = Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
      await redisClient.set(`${BLACKLIST_PREFIX}${token}`, '1', 'EX', ttl);
    } catch (err) {
      console.error('[session] blacklistToken error:', err.message);
    }
  },

  /** Vérifie si un token est blacklisté */
  isBlacklisted: async (token) => {
    if (!isRedisConnected()) return false;
    try {
      const val = await redisClient.get(`${BLACKLIST_PREFIX}${token}`);
      return val === '1';
    } catch (err) {
      console.error('[session] isBlacklisted error:', err.message);
      return false;
    }
  },

  // --- Affiliation volontaire (préfixes av: pour ne pas mélanger avec employeur) ---
  createAv: async (userId) => {
    if (isRedisConnected()) {
      try {
        await redisClient.set(`${AV_SESSION_PREFIX}${userId}`, '1', 'EX', SESSION_TTL);
        return;
      } catch (err) {
        console.error('[session] createAv error:', err.message);
      }
    }
  },
  getAv: async (userId) => {
    if (!isRedisConnected()) return null;
    try {
      return await redisClient.get(`${AV_SESSION_PREFIX}${userId}`);
    } catch (err) {
      console.error('[session] getAv error:', err.message);
      return null;
    }
  },
  deleteAv: async (userId) => {
    if (!isRedisConnected()) return 0;
    try {
      return await redisClient.del(`${AV_SESSION_PREFIX}${userId}`);
    } catch (err) {
      console.error('[session] deleteAv error:', err.message);
      return 0;
    }
  },
  setLoginOtpAv: async (userId, code) => {
    if (!isRedisConnected()) return;
    try {
      await redisClient.set(`${AV_OTP_LOGIN_PREFIX}${userId}`, String(code), 'EX', OTP_LOGIN_TTL);
    } catch (err) {
      console.error('[session] setLoginOtpAv error:', err.message);
    }
  },
  checkLoginOtpAv: async (userId, code) => {
    if (!isRedisConnected()) return false;
    try {
      const key = `${AV_OTP_LOGIN_PREFIX}${userId}`;
      const stored = await redisClient.get(key);
      if (stored !== String(code)) return false;
      await redisClient.del(key);
      return true;
    } catch (err) {
      console.error('[session] checkLoginOtpAv error:', err.message);
      return false;
    }
  },

  /**
   * Enregistre en Redis qu'une déclaration automatique a été créée pour ce mois (affiliation + year + periode).
   * Une déclaration automatique par mois par affiliation.
   */
  setDeclarationAutoAv: async (affiliationId, year, periode) => {
    if (!isRedisConnected()) return;
    try {
      const key = `${AV_DECLARATION_AUTO_PREFIX}${affiliationId}:${year}:${periode}`;
      await redisClient.set(key, '1', 'EX', AV_DECLARATION_AUTO_TTL);
    } catch (err) {
      console.error('[session] setDeclarationAutoAv error:', err.message);
    }
  },

  /** Indique si une déclaration automatique pour ce mois a déjà été enregistrée en Redis. */
  getDeclarationAutoAv: async (affiliationId, year, periode) => {
    if (!isRedisConnected()) return null;
    try {
      const key = `${AV_DECLARATION_AUTO_PREFIX}${affiliationId}:${year}:${periode}`;
      return await redisClient.get(key);
    } catch (err) {
      console.error('[session] getDeclarationAutoAv error:', err.message);
      return null;
    }
  }
};

module.exports = sessionService;
