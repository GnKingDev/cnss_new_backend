const Employe = require('./model');

const FIELD_LABELS = {
  email: 'Cet email',
  phone_number: 'Ce numéro de téléphone',
  no_immatriculation: "Ce numéro d'immatriculation",
  first_name: 'Le prénom',
  last_name: 'Le nom'
};

/**
 * Translate SQL errors to French messages
 * @param {string} sqlMessage - The SQL error message
 * @returns {string} French error message
 */
const translateSqlError = (sqlMessage) => {
  if (!sqlMessage) return 'Erreur inconnue';
  const lowerMessage = String(sqlMessage).toLowerCase();
  if (lowerMessage.includes('duplicate entry')) {
    if (lowerMessage.includes('email')) return 'Cet email existe déjà';
    if (lowerMessage.includes('phone_number')) return 'Ce numéro de téléphone existe déjà';
    if (lowerMessage.includes('no_immatriculation')) return "Ce numéro d'immatriculation existe déjà";
    return 'Cette valeur existe déjà';
  }
  if (lowerMessage.includes('foreign key constraint') || lowerMessage.includes('cannot add or update')) {
    return 'Référence invalide (employeur ou préfecture introuvable)';
  }
  if (lowerMessage.includes('cannot be null')) {
    if (lowerMessage.includes('first_name')) return 'Le prénom est obligatoire';
    if (lowerMessage.includes('last_name')) return 'Le nom est obligatoire';
    if (lowerMessage.includes('email')) return "L'email est obligatoire";
    if (lowerMessage.includes('phone_number')) return 'Le numéro de téléphone est obligatoire';
    return 'Certains champs obligatoires sont manquants';
  }
  if (lowerMessage.includes('data too long')) return 'Une valeur est trop longue';
  if (lowerMessage.includes('incorrect value')) return 'Format de données incorrect';
  return "Erreur lors de l'opération";
};

/**
 * Formate les erreurs Sequelize en message lisible pour l'utilisateur
 * @param {Error} error - Erreur Sequelize (peut être imbriquée dans .parent)
 * @returns {string} Message en français
 */
const formatSequelizeError = (error) => {
  if (!error) return "Erreur lors de la création de l'employé";

  const e = error.parent || error.original || error.cause || error;
  const msg = String(e.message || error.message || error.sqlMessage || '');
  const sql = String(error.sql || e.sql || '');

  // Contrainte d'unicité : fields peut être sur error, e, ou dans cause
  const fields = error.fields || e.fields || error.cause?.fields || {};
  const fieldNames = Object.keys(fields);
  if (fieldNames.length > 0) {
    const field = fieldNames[0];
    const value = fields[field];
    const label = FIELD_LABELS[field] || 'Cette valeur';
    const hint = value != null && value !== '' ? ` (${value})` : '';
    return `${label} existe déjà${hint}. Veuillez utiliser une autre valeur.`;
  }

  // Extraire la valeur dupliquée du message SQL (ex: Duplicate entry '629821308' for key...)
  const dupMatch = msg.match(/Duplicate entry '([^']*)'/i) || sql.match(/Duplicate entry '([^']*)'/i);
  const dupValue = dupMatch ? dupMatch[1] : null;

  const fullText = `${msg} ${sql}`.toLowerCase();
  if (fullText.includes('duplicate') || fullText.includes('unique') || (e.code === 'ER_DUP_ENTRY')) {
    if (fullText.includes('phone_number') || fullText.includes('phone')) {
      const hint = dupValue ? ` (${dupValue})` : '';
      return `Ce numéro de téléphone existe déjà${hint}. Veuillez utiliser une autre valeur.`;
    }
    if (fullText.includes('email')) {
      const hint = dupValue ? ` (${dupValue})` : '';
      return `Cet email existe déjà${hint}. Veuillez utiliser une autre valeur.`;
    }
    if (fullText.includes('no_immatriculation') || fullText.includes('immatriculation')) {
      const hint = dupValue ? ` (${dupValue})` : '';
      return `Ce numéro d'immatriculation existe déjà${hint}. Veuillez utiliser une autre valeur.`;
    }
    const hint = dupValue ? ` (${dupValue})` : '';
    return `Cette valeur existe déjà${hint}. Veuillez utiliser une autre valeur.`;
  }

  // Validation Sequelize
  const errors = error.errors || e.errors || [];
  if (Array.isArray(errors) && errors.length > 0) {
    const msgs = errors.map((err) => {
      const path = err.path || '';
      const label = FIELD_LABELS[path] || path.replace(/_/g, ' ');
      return `${label}: ${err.message || ''}`.trim();
    }).filter(Boolean);
    if (msgs.length > 0) return msgs.join('. ');
  }

  return translateSqlError(msg);
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
  { name: "15e MOIS", id: 11, code: "12" }, 
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
  formatSequelizeError,
  corrigerNumero,
  mounth
};

module.exports = utility;
