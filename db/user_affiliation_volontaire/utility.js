/**
 * Utilitaire auth pour l'affiliation volontaire (portail AV).
 * JWT et sessions séparés du portail employeur (AV_JWT_SECRET, préfixes Redis av:).
 */
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sessionService = require('../../services/session.service');

const AV_JWT_SECRET = process.env.AV_JWT_SECRET || process.env.AV_TOKEN_SECRET || 'av-secret-key-change-in-production';
const JWT_EXPIRES_IN = '3h';

const utility = {
  AV_JWT_SECRET,
  JWT_EXPIRES_IN,
  generateAvToken: (payload, options = {}) =>
    jwt.sign(payload, AV_JWT_SECRET, { expiresIn: options.expiresIn || JWT_EXPIRES_IN, ...options }),
  hashPassword: async (password) => {
    return await bcrypt.hash(password, 10);
  },

  comparePassword: async (password, hash) => {
    return await bcrypt.compare(password, hash);
  },

  setSessionAv: (userId) => sessionService.createAv(userId),
  getSessionAv: (userId) => sessionService.getAv(userId),
  deleteSessionAv: (userId) => sessionService.deleteAv(userId),
  setLoginOtpAv: (userId, code) => sessionService.setLoginOtpAv(userId, code),
  checkLoginOtpAv: (userId, code) => sessionService.checkLoginOtpAv(userId, code),
  isRedisConnected: () => sessionService.isAvailable(),

  _decodeAvToken: (token) => {
    if (!token?.trim()) return null;
    try {
      const decoded = jwt.verify(token, AV_JWT_SECRET);
      return { decoded, isFirstLoginToken: !!decoded.first_login };
    } catch {
      return null;
    }
  },

  /**
   * Middleware pour routes protégées AV (token principal, pas first_login).
   */
  AVToken: async (req, res, next) => {
    const path = req.originalUrl || req.path || '';
    try {
      const token = req.get('Authorization')?.replace('Bearer ', '');
      if (!token?.trim()) {
        return res.status(401).json({ message: 'Token affiliation volontaire requis' });
      }
      const result = utility._decodeAvToken(token);
      if (!result || result.isFirstLoginToken) {
        return res.status(401).json({ message: 'Token invalide ou expiré' });
      }
      const { decoded } = result;
      if (sessionService.isAvailable()) {
        let session = await sessionService.getAv(decoded.id);
        if (!session) await sessionService.createAv(decoded.id);
      }
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Token invalide', error: error.message });
    }
  },

  /**
   * Middleware verify_token / signOut : accepte token AV principal ou first_login.
   */
  VerifyTokenFlexibleAV: async (req, res, next) => {
    const path = req.originalUrl || req.path || '';
    try {
      const token = req.get('Authorization')?.replace('Bearer ', '');
      if (!token?.trim()) {
        return res.status(401).json({ message: 'Token manquant ou invalide' });
      }
      const result = utility._decodeAvToken(token);
      if (!result) {
        return res.status(401).json({ message: 'Token manquant ou invalide' });
      }
      const { decoded, isFirstLoginToken } = result;
      if (!isFirstLoginToken && sessionService.isAvailable()) {
        let session = await sessionService.getAv(decoded.id);
        if (!session) await sessionService.createAv(decoded.id);
      }
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Token invalide', error: error.message });
    }
  },

  /**
   * Token temporaire après login (avant verify_otp), 30 min.
   */
  otpVerifyTokenAV: async (req, res, next) => {
    try {
      const token = req.get('Authorization')?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ message: 'Token manquant' });
      const decoded = jwt.verify(token, AV_JWT_SECRET);
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ message: 'Token temporaire invalide' });
    }
  }
};

module.exports = utility;
