const Employe = require('./model');

/**
 * Translate SQL errors to French messages
 * @param {string} sqlMessage - The SQL error message
 * @returns {string} French error message
 */
const translateSqlError = (sqlMessage) => {
  if (!sqlMessage) return 'Erreur inconnue';
  
  const lowerMessage = sqlMessage.toLowerCase();
  
  // Duplicate entry errors
  if (lowerMessage.includes('duplicate entry')) {
    if (lowerMessage.includes('email')) {
      return 'Cet email existe déjà';
    }
    if (lowerMessage.includes('phone_number')) {
      return 'Ce numéro de téléphone existe déjà';
    }
    if (lowerMessage.includes('no_immatriculation')) {
      return 'Ce numéro d\'immatriculation existe déjà';
    }
    return 'Cette valeur existe déjà';
  }
  
  // Foreign key constraint errors
  if (lowerMessage.includes('foreign key constraint') || lowerMessage.includes('cannot add or update')) {
    return 'Référence invalide (employeur ou préfecture introuvable)';
  }
  
  // Null constraint errors
  if (lowerMessage.includes('cannot be null')) {
    if (lowerMessage.includes('first_name')) {
      return 'Le prénom est obligatoire';
    }
    if (lowerMessage.includes('last_name')) {
      return 'Le nom est obligatoire';
    }
    if (lowerMessage.includes('email')) {
      return 'L\'email est obligatoire';
    }
    if (lowerMessage.includes('phone_number')) {
      return 'Le numéro de téléphone est obligatoire';
    }
    return 'Certains champs obligatoires sont manquants';
  }
  
  // Data too long errors
  if (lowerMessage.includes('data too long')) {
    return 'Une valeur est trop longue';
  }
  
  // Incorrect value errors
  if (lowerMessage.includes('incorrect value')) {
    return 'Format de données incorrect';
  }
  
  // Default error
  return 'Erreur lors de l\'opération';
};

/**
 * Correct a registration number by removing two zeros after the first 5 characters
 * @param {string} numero - The registration number
 * @returns {string} Corrected number
 */
const corrigerNumero = (numero) => {
  if (typeof numero !== 'string') {
    return numero;
  }
  
  if (numero.length > 5 && numero.substring(5, 7) === '00') {
    return numero.substring(0, 5) + numero.substring(7);
  }
  
  return numero;
};

/**
 * Month mapping array
 */
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
  { name: "13e MOIS", id: 11, code: "12" },
  { name: "14e MOIS", id: 11, code: "12" },
  { name: "15e MOIS", id: 11, code: "12" }
];

const utility = {
  findByNoImmatriculation: async (no_immatriculation) => {
    return await Employe.findOne({ where: { no_immatriculation } });
  },

  findByEmail: async (email) => {
    return await Employe.findOne({ where: { email } });
  },

  findByPhone: async (phone_number) => {
    return await Employe.findOne({ where: { phone_number } });
  },

  findByEmployeur: async (employeurId) => {
    return await Employe.findAll({ where: { employeurId } });
  },

  translateSqlError,
  corrigerNumero,
  mounth
};

module.exports = utility;
