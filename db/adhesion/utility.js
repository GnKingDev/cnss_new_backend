const Adhesion = require('./model');

/**
 * Vérifie si une adhésion existe déjà pour ce numéro d'immatriculation.
 */
async function hasExistingAdhesion(no_immatriculation) {
  const existing = await Adhesion.findOne({ where: { no_immatriculation } });
  return !!existing;
}

/**
 * Construit l'objet pour créer un RequestEmployeur à partir d'une adhésion.
 */
function buildRequesterFromAdhesion(adhesion) {
  return {
    first_name: adhesion.first_name ?? '',
    last_name: adhesion.last_name ?? ''
  };
}

/**
 * Construit l'objet pour créer un Employeur à partir d'une adhésion et du requester id.
 */
function buildEmployeurFromAdhesion(adhesion, request_employeurId) {
  return {
    is_insert_oldDB: true,
    is_immatriculed: true,
    is_new_compamy: false,
    email: adhesion.email,
    phone_number: adhesion.phone_number,
    raison_sociale: adhesion.raison_sociale,
    no_immatriculation: adhesion.no_immatriculation,
    no_dni: adhesion.no_dni ?? '',
    no_rccm: adhesion.no_rccm ?? '',
    category: adhesion.category ?? '',
    effectif_femme: adhesion.effectif_femme,
    effectif_homme: adhesion.effectif_homme,
    effectif_apprentis: adhesion.effectif_apprentis,
    request_employeurId,
    adresse: adhesion.address
  };
}

/**
 * Construit l'objet pour créer un User à partir d'une adhésion, employeur et mot de passe hashé.
 */
function buildUserFromAdhesion(adhesion, employeurId, passwordHashed) {
  return {
    user_identify: adhesion.no_immatriculation,
    role: 'employeur',
    first_login: true,
    user_id: employeurId,
    password: passwordHashed,
    identity: adhesion.no_immatriculation,
    full_name: `${adhesion.first_name ?? ''} ${adhesion.last_name ?? ''}`.trim(),
    email: adhesion.email,
    phone_number: adhesion.phone_number
  };
}

const utility = {
  findByNoImmatriculation: async (no_immatriculation) => {
    return await Adhesion.findOne({ where: { no_immatriculation } });
  },

  findByEmail: async (email) => {
    return await Adhesion.findOne({ where: { email } });
  },

  hasExistingAdhesion,
  buildRequesterFromAdhesion,
  buildEmployeurFromAdhesion,
  buildUserFromAdhesion
};

module.exports = utility;
