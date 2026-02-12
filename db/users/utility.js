const Users = require('./model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const { client: redisClient, isRedisConnected: redisIsConnected } = require('../../redis.connect');

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

  // Generate unique code for passwords
  generateUniqueCode: (length = 9) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Generate identity for sub-accounts (P1, P2, R1, R2, etc.)
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
      if (match) {
        nextNumber = parseInt(match[0]) + 1;
      }
    }

    return `${prefix}${nextNumber}`;
  },

  // Redis session helpers (shared client from redis.connect.js)
  setSession: async (userId) => {
    if (!redisIsConnected()) return;
    try {
      await redisClient.set(`user:${userId}`, 'true', 'EX', 1800); // 30 minutes
    } catch (error) {
      console.error('Redis setSession error:', error);
    }
  },

  getSession: async (userId) => {
    if (!redisIsConnected()) return null;
    try {
      return await redisClient.get(`user:${userId}`);
    } catch (error) {
      console.error('Redis getSession error:', error);
      return null;
    }
  },

  deleteSession: async (userId) => {
    if (!redisIsConnected()) return 0;
    try {
      return await redisClient.del(`user:${userId}`);
    } catch (error) {
      console.error('Redis deleteSession error:', error);
      return 0;
    }
  },

  /** Code OTP envoyé au login employeur : valide 5 min, un seul usage (évite refus TOTP si délai) */
  setLoginOtp: async (userId, code) => {
    if (!redisIsConnected()) return;
    try {
      await redisClient.set(`otp:login:${userId}`, String(code), 'EX', 300);
    } catch (error) {
      console.error('Redis setLoginOtp error:', error);
    }
  },

  checkLoginOtp: async (userId, code) => {
    if (!redisIsConnected()) return false;
    try {
      const key = `otp:login:${userId}`;
      const stored = await redisClient.get(key);
      if (stored !== String(code)) return false;
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Redis checkLoginOtp error:', error);
      return false;
    }
  },

  isRedisConnected: () => redisIsConnected(),

  // Middleware: Verify token for employeur
  EmployeurToken: async (req, res, next) => {
    try {
      const token = req.get('Authorization')?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ message: 'Token manquant' });
      }

      const decoded = jwt.verify(token, process.env.EMPLOYEUR_KEY || process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      
      // Check Redis session (if available)
      const session = await utility.getSession(decoded.id);
      if (utility.isRedisConnected() && !session) {
        return res.status(401).json({ message: 'Session expirée' });
      }

      // Verify user exists and can work
      const user = await Users.findByPk(decoded.id);
      if (!user || !user.can_work) {
        return res.status(401).json({ message: 'Utilisateur non autorisé' });
      }

      // Update last connect time
      await user.update({ last_connect_time: new Date() });

      // Renew session (if Redis available)
      await utility.setSession(decoded.id);

      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Token invalide', error: error.message });
    }
  },

  // Middleware: Verify token for employe
  EmployeToken: async (req, res, next) => {
    try {
      const token = req.get('Authorization')?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ message: 'Token manquant' });
      }

      const decoded = jwt.verify(token, process.env.EMPLOYE_KEY || 'your-secret-key');
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Token invalide' });
    }
  },

  // Middleware: Verify temporary OTP token
  otpVerifyToken: async (req, res, next) => {
    try {
      const token = req.get('Authorization')?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ message: 'Token manquant' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Token temporaire invalide' });
    }
  }
};

module.exports = utility;
