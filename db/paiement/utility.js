const Paiement = require('./model');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

/**
 * Utility functions for Paiement model
 */
const utility = {
  /**
   * Find paiement by cotisation
   * @param {number} cotisation_employeurId - The cotisation ID
   * @returns {Promise<Paiement[]>}
   */
  findByCotisation: async (cotisation_employeurId) => {
    try {
      return await Paiement.findAll({ 
        where: { cotisation_employeurId },
        include: [
          { association: 'cotisation_employeur' },
          { association: 'employeur' }
        ]
      });
    } catch (error) {
      console.error('[PAIEMENT_UTILITY] Error finding by cotisation:', error);
      throw error;
    }
  },

  /**
   * Find paiement by employeur
   * @param {number} employeurId - The employeur ID
   * @returns {Promise<Paiement[]>}
   */
  findByEmployeur: async (employeurId) => {
    try {
      return await Paiement.findAll({ 
        where: { employeurId },
        include: [
          { association: 'cotisation_employeur' },
          { association: 'employeur' }
        ],
        order: [['createdAt', 'DESC']]
      });
    } catch (error) {
      console.error('[PAIEMENT_UTILITY] Error finding by employeur:', error);
      throw error;
    }
  },

  /**
   * Find paiement by status
   * @param {string} status - The payment status
   * @returns {Promise<Paiement[]>}
   */
  findByStatus: async (status) => {
    try {
      return await Paiement.findAll({ 
        where: { status },
        include: [
          { association: 'cotisation_employeur' },
          { association: 'employeur' }
        ]
      });
    } catch (error) {
      console.error('[PAIEMENT_UTILITY] Error finding by status:', error);
      throw error;
    }
  },

  /**
   * Generate UUID v4
   * @returns {string} UUID
   */
  geneUID: () => {
    return uuidv4();
  },

  /**
   * Get payment link for Paylican
   * @param {object} detail - Payment detail with merchantReference and invoiceId
   * @returns {string} Payment URL
   */
  getPaymentLink: (detail) => {
    const merchantReference = detail.merchantReference || detail.merchant_reference;
    const invoiceId = detail.invoiceId || detail.invoice_id;
    
    return `https://sso-paylican.guceg.gov.gn/auth/realms/PGW/protocol/openid-connect/auth?client_id=invoice-system-client&redirect_uri=https://cnss-payment-adapter.guceg.gov.gn/api/v1/pay/CNSS/${merchantReference}/${invoiceId}&response_type=code&scope=openid`;
  },

  /**
   * Get Paylican payment token
   * @returns {Promise<string>} Access token
   */
  onlyPaiementToken: async () => {
    try {
      if (!process.env.PAYLICAN_TOKEN_URL || !process.env.PAYLICAN_PAYEMENT_TOKEN_USERNAME || !process.env.PAYLICAN_PAYEMENT_TOKEN_PASSWORD) {
        throw new Error('Paylican credentials not configured');
      }

      const formData = new URLSearchParams();
      formData.append('username', process.env.PAYLICAN_PAYEMENT_TOKEN_USERNAME);
      formData.append('password', process.env.PAYLICAN_PAYEMENT_TOKEN_PASSWORD);
      formData.append('grant_type', 'password');
      formData.append('client_id', 'payment_adapter_client');

      const response = await axios.post(process.env.PAYLICAN_TOKEN_URL, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.status === 200 && response.data.access_token) {
        return response.data.access_token;
      } else {
        throw new Error('Failed to get Paylican token');
      }
    } catch (error) {
      console.error('[PAIEMENT_UTILITY] Error getting Paylican token:', error);
      throw error;
    }
  },

  /**
   * Initialize payment in Paylican
   * @param {object} paiement - Paiement object with cotisation_employeur relation
   * @param {object} employeur - Employeur object
   * @param {string} UID - Merchant reference UUID
   * @returns {Promise<object>} Payment detail with invoiceId
   */
  initPaiment: async (paiement, employeur, UID) => {
    try {
      // Month codes mapping
      const mounth = [
        { name: "JANVIER", id: 0, code: "01" },
        { name: "FEVRIER", id: 1, code: "02" },
        { name: "MARS", id: 2, code: "03" },
        { name: "AVRIL", id: 3, code: "04" },
        { name: "MAI", id: 4, code: "05" },
        { name: "JUIN", id: 5, code: "06" },
        { name: "JUILLET", id: 6, code: "07" },
        { name: "AOUT", id: 7, code: "08" },
        { name: "SEPTEMBRE", id: 8, code: "09" },
        { name: "OCTOBRE", id: 9, code: "10" },
        { name: "NOVEMBRE", id: 10, code: "11" },
        { name: "DECEMBRE", id: 11, code: "12" },
        { name: "13e MOIS", id: 12, code: "13", libel: "13e MOIS" },
        { name: "14e MOIS", id: 13, code: "14", libel: "14e MOIS" },
        { name: "15e MOIS", id: 14, code: "15", libel: "15e MOIS" }
      ];

      const code = mounth.find((e) => e.name == paiement.cotisation_employeur.periode)?.code || "01";
      const token = await utility.onlyPaiementToken();

      if (!process.env.PAYLICAN_PAYMENT) {
        throw new Error('Paylican payment URL not configured');
      }

      const paymentData = {
        amount: paiement.cotisation_employeur.total_branche || paiement.cotisation_employeur.real_total_branche,
        type: "CNSS",
        customerCode: employeur.no_immatriculation,
        merchantReference: UID,
        redirectionUrl: "https://compte.ecnss.gov.gn/#/portail/payment/make_paiment",
        itemName: `COTISATIONS SOCIALES ${code}/${paiement.cotisation_employeur.year} ${employeur.raison_sociale}`,
        beneficiaryCode: "CNSS-01",
        additionalFields: [{
          code: "motif",
          value: "default"
        }]
      };

      const response = await axios.post(process.env.PAYLICAN_PAYMENT, paymentData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 200) {
        return response.data;
      } else {
        throw new Error(`Paylican API error: ${response.status}`);
      }
    } catch (error) {
      console.error('[PAIEMENT_UTILITY] Error initializing payment:', error);
      throw error;
    }
  },

  /**
   * Initialize penalty payment in Paylican
   * @param {number} id - Penalty ID
   * @returns {Promise<string>} Payment link
   */
  initPenalite: async (id) => {
    try {
      const Penalite = require('../penalites/model');
      const penalite = await Penalite.findByPk(id, {
        include: [{ association: 'employeur' }]
      });

      if (!penalite) {
        throw new Error('Pénalité non trouvée');
      }

      // If already initiated, return existing link
      if (penalite.merchantReference && penalite.invoiceId) {
        return utility.getPaymentLink({
          merchantReference: penalite.merchantReference,
          invoiceId: penalite.invoiceId
        });
      }

      // Calculate period
      const periode = penalite.periode 
        ? `${penalite.periode.substring(4, 6)}/${penalite.periode.substring(0, 4)}`
        : '01/2025';

      const token = await utility.onlyPaiementToken();
      const UID = utility.geneUID();

      if (!process.env.PAYLICAN_PAYMENT) {
        throw new Error('Paylican payment URL not configured');
      }

      const paymentData = {
        amount: penalite.montant,
        type: "CNSS",
        customerCode: penalite.employeur.no_immatriculation,
        merchantReference: UID,
        redirectionUrl: "https://compte.cnss.gov.gn/#/employe_dashbord/tele-paiement/consultation",
        itemName: `${penalite.motif || 'PENALITE'} ${periode} ${penalite.employeur.raison_sociale}`,
        beneficiaryCode: "CNSS-01",
        additionalFields: [{
          code: "motif",
          value: "penalite"
        }]
      };

      const response = await axios.post(process.env.PAYLICAN_PAYMENT, paymentData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 200) {
        const detail = response.data;
        penalite.merchantReference = detail.merchantReference || UID;
        penalite.invoiceId = detail.invoiceId || detail.id;
        await penalite.save();

        return utility.getPaymentLink(detail);
      } else {
        throw new Error(`Paylican API error: ${response.status}`);
      }
    } catch (error) {
      console.error('[PAIEMENT_UTILITY] Error initializing penalty payment:', error);
      throw error;
    }
  },

  /**
   * Get first day of next month
   * @param {string} dateString - Date string in format YYYY-MM-DD
   * @returns {string} First day of next month in format YYYY-MM-DD
   */
  getPremierJourMoisSuivant: (dateString) => {
    const date = new Date(dateString);
    const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const year = nextMonth.getFullYear();
    const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
    const day = '01';
    return `${year}-${month}-${day}`;
  },

  /**
   * Generate unique code
   * @param {number} length - Code length (default: 9)
   * @returns {string} Unique code
   */
  generateUniqueCode: (length = 9) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result.length >= 9 ? result : '5423AaUj8';
  }
};

module.exports = utility;
