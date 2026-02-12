const Quittance = require('./model');

/**
 * Utility functions for Quittance model
 */
const utility = {
  /**
   * Find quittance by reference
   * @param {string} reference - The quittance reference
   * @returns {Promise<Quittance|null>}
   */
  findByReference: async (reference) => {
    try {
      return await Quittance.findOne({ 
        where: { reference },
        attributes: { exclude: ['secret_code'] } // Don't expose secret_code by default
      });
    } catch (error) {
      console.error('[QUITTANCE_UTILITY] Error finding by reference:', error);
      throw error;
    }
  },

  /**
   * Find quittance by secret code
   * @param {string} secretCode - The quittance secret code
   * @returns {Promise<Quittance|null>}
   */
  findBySecretCode: async (secretCode) => {
    try {
      return await Quittance.findOne({ 
        where: { secret_code: secretCode },
        include: [
          { association: 'employeur' },
          { association: 'cotisation_employeur' }
        ]
      });
    } catch (error) {
      console.error('[QUITTANCE_UTILITY] Error finding by secret code:', error);
      throw error;
    }
  },

  /**
   * Find quittance by paiement ID
   * @param {number} paiementId - The paiement ID
   * @returns {Promise<Quittance|null>}
   */
  findByPaiement: async (paiementId) => {
    try {
      return await Quittance.findOne({ 
        where: { paiementId } 
      });
    } catch (error) {
      console.error('[QUITTANCE_UTILITY] Error finding by paiement:', error);
      throw error;
    }
  },

  /**
   * Find all quittances for an employeur
   * @param {number} employeurId - The employeur ID
   * @returns {Promise<Quittance[]>}
   */
  findByEmployeur: async (employeurId) => {
    try {
      return await Quittance.findAll({ 
        where: { employeurId },
        attributes: { exclude: ['secret_code'] }, // Don't expose secret_code in lists
        order: [['createdAt', 'DESC']]
      });
    } catch (error) {
      console.error('[QUITTANCE_UTILITY] Error finding by employeur:', error);
      throw error;
    }
  }
};

module.exports = utility;
