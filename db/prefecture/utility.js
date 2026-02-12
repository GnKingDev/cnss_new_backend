const Prefecture = require('./model');
const Users = require('../users/model');
const DirgaU = require('../dirga_user/model');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const { client: redisClient, isRedisConnected: redisIsConnected } = require('../../redis.connect');

/**
 * Utility functions for Prefecture model
 */
const utility = {
  /**
   * Check if Redis is connected
   * @returns {boolean}
   */
  isRedisConnected: () => redisIsConnected(),

  /**
   * Get Redis client (shared)
   * @returns {object}
   */
  getRedisClient: () => redisClient,

  /**
   * Verify token for admin authentication (DIRGA or Users with type='admin')
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   * @param {function} next - Express next middleware
   */
  verifyToken: async (req, res, next) => {
    try {
      const authHeader = req.get('Authorization');
      if (!authHeader) {
        return res.status(401).json({ message: 'Erreur authentification' });
      }

      const token = authHeader.split(' ')[1] || authHeader;
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

      // Verify DIRGA user
      const dirgaUser = await DirgaU.findByPk(decoded.id);
      if (dirgaUser && dirgaUser.can_work) {
        req.user = { ...decoded, type: 'dirga' };
        return next();
      }

      // Verify Users with type='admin'
      const user = await Users.findByPk(decoded.id);
      if (user && user.type === 'admin' && user.can_work) {
        req.user = { ...decoded, type: 'admin' };
        return next();
      }

      return res.status(401).json({ message: 'Accès non autorisé' });
    } catch (error) {
      return res.status(401).json({ message: 'Token invalide' });
    }
  },

  /**
   * Find prefecture by code
   * @param {string} code - The prefecture code
   * @returns {Promise<Prefecture|null>}
   */
  findByCode: async (code) => {
    try {
      return await Prefecture.findOne({ 
        where: { code },
        include: [{ association: 'pays' }]
      });
    } catch (error) {
      console.error('[PREFECTURE_UTILITY] Error finding by code:', error);
      throw error;
    }
  },

  /**
   * Find prefecture by name
   * @param {string} name - The prefecture name
   * @returns {Promise<Prefecture|null>}
   */
  findByName: async (name) => {
    try {
      return await Prefecture.findOne({ 
        where: { name: { [Op.like]: `%${name}%` } },
        include: [{ association: 'pays' }]
      });
    } catch (error) {
      console.error('[PREFECTURE_UTILITY] Error finding by name:', error);
      throw error;
    }
  },

  /**
   * Find all prefectures by pays ID
   * @param {number} paysId - The pays ID
   * @returns {Promise<Prefecture[]>}
   */
  findByPays: async (paysId) => {
    try {
      return await Prefecture.findAll({ 
        where: { paysId },
        include: [{ association: 'pays' }],
        order: [['name', 'ASC']]
      });
    } catch (error) {
      console.error('[PREFECTURE_UTILITY] Error finding by pays:', error);
      throw error;
    }
  },

  /**
   * Invalidate prefecture cache
   * @returns {Promise<void>}
   */
  invalidateCache: async () => {
    if (!redisIsConnected()) return;
    try {
      await redisClient.del('prefectures:all');
      const keys = await redisClient.keys('prefectures:by_pays:*');
      if (keys.length > 0) await redisClient.del(...keys);
    } catch (error) {
      console.error('[PREFECTURE_UTILITY] Error invalidating cache:', error);
    }
  }
};

module.exports = utility;
