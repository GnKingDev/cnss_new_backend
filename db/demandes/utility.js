const Demande = require('./model');
const Quitus = require('../quitus/model');
const { Op } = require('sequelize');
const sequelize = require('../db.connection');

/**
 * Utility functions for Demande model
 */
const utility = {
  /**
   * Find demande by reference
   * @param {string} reference - The demande reference
   * @returns {Promise<Demande|null>}
   */
  findByReference: async (reference) => {
    try {
      return await Demande.findOne({ 
        where: { reference },
        include: [
          { association: 'employeur' },
          { association: 'user' },
          { association: 'dirga' }
        ]
      });
    } catch (error) {
      console.error('[DEMANDE_UTILITY] Error finding by reference:', error);
      throw error;
    }
  },

  /**
   * Find demandes by employeur
   * @param {number} employeurId - The employeur ID
   * @returns {Promise<Demande[]>}
   */
  findByEmployeur: async (employeurId) => {
    try {
      return await Demande.findAll({ 
        where: { employeurId },
        include: [
          { association: 'employeur' },
          { association: 'user' }
        ],
        order: [['createdAt', 'DESC']]
      });
    } catch (error) {
      console.error('[DEMANDE_UTILITY] Error finding by employeur:', error);
      throw error;
    }
  },

  /**
   * Find demandes by status
   * @param {string} status - The demande status
   * @returns {Promise<Demande[]>}
   */
  findByStatus: async (status) => {
    try {
      return await Demande.findAll({ 
        where: { status },
        include: [
          { association: 'employeur' },
          { association: 'user' }
        ]
      });
    } catch (error) {
      console.error('[DEMANDE_UTILITY] Error finding by status:', error);
      throw error;
    }
  },

  /**
   * Generate unique reference for quitus
   * Format: XXXXXX{id}XXXX (6 random chars + ID + 4 random chars)
   * @returns {Promise<string>} Unique reference
   */
  generateUniqueReference: async () => {
    const transaction = await sequelize.transaction();
    try {
      // Generate random strings
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const randomString1 = Array.from({ length: 6 }, () => 
        chars.charAt(Math.floor(Math.random() * chars.length))
      ).join('');
      
      // Get last quitus to determine next ID
      const lastItem = await Quitus.findOne({
        order: [['id', 'DESC']],
        lock: transaction.LOCK.UPDATE // Exclusive lock to prevent race condition
      }, { 
        transaction,
        lock: true
      });
      
      const nextId = lastItem ? lastItem.id + 1 : 1;
      
      const randomString2 = Array.from({ length: 4 }, () => 
        chars.charAt(Math.floor(Math.random() * chars.length))
      ).join('');
      
      const ref = `${randomString1}${nextId}${randomString2}`;
      
      await transaction.commit();
      return ref;
    } catch (error) {
      await transaction.rollback();
      console.error('[DEMANDE_UTILITY] Error generating unique reference:', error);
      throw error;
    }
  },

  /**
   * Add months to date according to category
   * E-20: Fixed dates (20/04, 20/07, 20/10, 31/12)
   * E+20: Add 1 month, set day to 20
   * @param {string|Date} lastPaiementDate - Last payment date (DD/MM/YYYY or Date)
   * @param {string} categorie - "E-20" or "E+20"
   * @returns {string} Expiration date in format DD/MM/YYYY
   */
  ajouterMoisSelonCategorie: (lastPaiementDate, categorie) => {
    let date;
    if (typeof lastPaiementDate === 'string') {
      const [day, month, year] = lastPaiementDate.split('/');
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
      date = new Date(lastPaiementDate);
    }

    if (categorie === "E-20") {
      const month = date.getMonth() + 1; // 1-12
      const year = date.getFullYear();

      if (month >= 1 && month <= 3) {
        return `20/04/${year}`;
      } else if (month >= 4 && month <= 6) {
        return `20/07/${year}`;
      } else if (month >= 7 && month <= 9) {
        return `20/10/${year}`;
      } else {
        return `31/12/${year}`;
      }
    } else if (categorie === "E+20") {
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 20);
      const currentYear = date.getFullYear();
      
      if (nextMonth.getFullYear() > currentYear) {
        return `31/12/${currentYear}`;
      }
      
      const day = String(nextMonth.getDate()).padStart(2, '0');
      const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
      const year = nextMonth.getFullYear();
      
      return `${day}/${month}/${year}`;
    }

    // Default: return same date
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  },

  /**
   * Calculate remaining days/months for E-20 category
   * @param {string|Date} lastPaiementDate - Last payment date (DD/MM/YYYY or Date)
   * @returns {string} Remaining period (e.g., "3 mois et 15 jours")
   */
  joursRestantsE20: (lastPaiementDate) => {
    let date;
    if (typeof lastPaiementDate === 'string') {
      const [day, month, year] = lastPaiementDate.split('/');
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
      date = new Date(lastPaiementDate);
    }

    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear();

    let prochaineDateFixe;
    if (month >= 1 && month <= 4) {
      prochaineDateFixe = new Date(year, 3, 20); // April 20
    } else if (month >= 5 && month <= 7) {
      prochaineDateFixe = new Date(year, 6, 20); // July 20
    } else if (month >= 8 && month <= 10) {
      prochaineDateFixe = new Date(year, 9, 20); // October 20
    } else {
      prochaineDateFixe = new Date(year + 1, 0, 20); // January 20 next year
    }

    const differenceMs = prochaineDateFixe - date;
    const differenceJours = Math.ceil(differenceMs / (1000 * 60 * 60 * 24));

    if (differenceJours <= 0) {
      return "0 jour";
    }

    const moisRestants = Math.floor(differenceJours / 30);
    const joursRestants = differenceJours % 30;

    if (moisRestants > 0) {
      return `${moisRestants} mois et ${joursRestants} jour${joursRestants > 1 ? 's' : ''}`;
    } else {
      return `${joursRestants} jour${joursRestants > 1 ? 's' : ''}`;
    }
  },

  /**
   * Check if expiration date is passed
   * @param {string|Date} dateExpirationStr - Expiration date
   * @returns {boolean} True if expired
   */
  estExpiree: (dateExpirationStr) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dateExpiration = new Date(dateExpirationStr);
    dateExpiration.setHours(0, 0, 0, 0);
    
    return today > dateExpiration;
  },

  /**
   * Generate secret code (5 characters alphanumeric)
   * @returns {string} Secret code
   */
  secretCode: () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }
};

module.exports = utility;
