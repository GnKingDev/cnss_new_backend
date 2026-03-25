const Users = require('./model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const sessionService = require('../../services/session.service');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const EMPLOYEUR_KEY = process.env.EMPLOYEUR_KEY || process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '3h';

const utility = {
  findByIdentity: async (identity) => {
    return await Users.findOne({ where: { identity }, raw: true });
  },

  findByEmail: async (email) => {
    return await Users.findOne({ where: { email } });
  },

  findByUserIdentify: async (user_identify) => {
    return await Users.findOne({ where: { user_identify } });
  },

  hashPassword: async (password) => {
    return await bcrypt.hash(password, 10);
  },

  comparePassword: async (password, hash) => {
    return await bcrypt.compare(password, hash);
  },

  generateUniqueCode: (length = 9) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  generateIdentity: async (role, user_identify) => {
    const prefix = role === 'Payeur' ? 'P' : 'R';
    const lastUser = await Users.findOne({
      where: {
        user_identify: user_identify,
        identity: { [Op.like]: `${prefix}%` }
      },
      order: [['createdAt', 'DESC']],
      raw: true
    });
    let nextNumber = 1;
    if (lastUser && lastUser.identity) {
      const match = lastUser.identity.match(/\d+$/);
      if (match) nextNumber = parseInt(match[0], 10) + 1;
    }
    return `${prefix}${nextNumber}`;
  },

  // --- Session (délègue au service) ---
  setSession: (userId) => sessionService.create(userId),
  getSession: (userId) => sessionService.get(userId),
  deleteSession: (userId) => sessionService.delete(userId),
  setLoginOtp: (userId, code) => sessionService.setLoginOtp(userId, code),
  checkLoginOtp: (userId, code) => sessionService.checkLoginOtp(userId, code),
  addToBlacklist: (token) => sessionService.blacklistToken(token),
  isBlacklisted: (token) => sessionService.isBlacklisted(token),
  isRedisConnected: () => sessionService.isAvailable(),

  /**
   * Décode le token. EMPLOYEUR_KEY = token employeur. JWT_SECRET = token first_login (OTP changement mot de passe).
   */
  _decodeToken: (token) => {
    if (!token?.trim()) return null;
    try {
      const decoded = jwt.verify(token, EMPLOYEUR_KEY);
      return { decoded, isFirstLoginToken: false };
    } catch {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return { decoded, isFirstLoginToken: !!decoded.first_login };
      } catch {
        return null;
      }
    }
  },

  /**
   * Middleware verify_token / signOut : accepte token employeur (EMPLOYEUR_KEY) ou first_login (JWT_SECRET).
   * Utilisé uniquement pour GET verify_token et POST signOut (flux OTP + changement mot de passe).
   */
  VerifyTokenFlexible: async (req, res, next) => {
    const path = req.originalUrl || req.path || '';
    try {
      const token = req.get('Authorization')?.replace('Bearer ', '');
      if (!token?.trim()) {
        console.log('[VerifyTokenFlexible] 401', path, '| token: manquant');
        return res.status(401).json({ message: 'Token manquant ou invalide' });
      }
      const result = utility._decodeToken(token);
      if (!result) {
        console.log('[VerifyTokenFlexible] 401', path, '| token: invalide ou expiré');
        return res.status(401).json({ message: 'Token manquant ou invalide' });
      }
      const { decoded, isFirstLoginToken } = result;
      if (!isFirstLoginToken && sessionService.isAvailable()) {
        let session = await sessionService.get(decoded.id);
        if (!session) await sessionService.create(decoded.id);
      }
      const user = await Users.findByPk(decoded.id);
      if (!user || !user.can_work) {
        console.log('[VerifyTokenFlexible] 401', path, '| user non trouvé ou can_work=false');
        return res.status(401).json({ message: 'Utilisateur non autorisé' });
      }
      await user.update({ last_connect_time: new Date() });
      if (!isFirstLoginToken && sessionService.isAvailable()) await sessionService.create(decoded.id);
      req.user = decoded;
      next();
    } catch (error) {
      console.log('[VerifyTokenFlexible] 401', path, '| error:', error.message);
      return res.status(401).json({ message: 'Token invalide', error: error.message });
    }
  },

  /**
   * Middleware employeur : token JWT (EMPLOYEUR_KEY), durée 3h, session Redis. Routes dashboard, profile, paiement, etc.
   * Utilisé pour toutes les routes protégées (dashboard, profile, etc.).
   */
  EmployeurToken: async (req, res, next) => {
    const path = req.originalUrl || req.path || '';
    try {
      const token = req.get('Authorization')?.replace('Bearer ', '');
      if (!token?.trim()) {
        console.log('[EmployeurToken] 401', path, '| token: manquant');
        return res.status(401).json({ message: 'Token employeur requis' });
      }
      const result = utility._decodeToken(token);
      if (!result || result.isFirstLoginToken) {
        console.log('[EmployeurToken] 401', path, '| token invalide ou expiré');
        return res.status(401).json({ message: 'Token employeur requis' });
      }

      const { decoded } = result;

      if (sessionService.isAvailable()) {
        let session = await sessionService.get(decoded.id);
        if (!session) {
          await sessionService.create(decoded.id);
        }
      }

      const user = await Users.findByPk(decoded.id);
      if (!user || !user.can_work) {
        console.log('[EmployeurToken] 401', path, '| user non trouvé ou can_work=false, id=', decoded.id);
        return res.status(401).json({ message: 'Utilisateur non autorisé' });
      }

      await user.update({ last_connect_time: new Date() });
      if (sessionService.isAvailable()) await sessionService.create(decoded.id);
      req.user = decoded;
      next();
    } catch (error) {
      console.log('[EmployeurToken] 401', path, '| error:', error.message);
      return res.status(401).json({ message: 'Token invalide', error: error.message });
    }
  },

  EmployeToken: async (req, res, next) => {
    try {
      const token = req.get('Authorization')?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ message: 'Token manquant' });
      const decoded = jwt.verify(token, process.env.EMPLOYE_KEY || 'your-secret-key');
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ message: 'Token invalide' });
    }
  },

  otpVerifyToken: async (req, res, next) => {
    try {
      const token = req.get('Authorization')?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ message: 'Token manquant' });
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ message: 'Token temporaire invalide' });
    }
  }
};

module.exports = utility;
