const AffiliationVolontaire = require('./model');

/** Plafond affiliation volontaire (FCFA) */
const PLAFOND = { min: 550000, max: 2500000 };

/** Taux par branche (défaut) */
const RATES = {
  assurance_maladie: 0.065,
  risque_professionnel: 0.06,
  vieillesse: 0.065
};

/**
 * Calcule le plafond mensuel (revenu annuel / 12, borné).
 * @param {number} revenu_annuel
 * @returns {number}
 */
function getPlafondMensuel(revenu_annuel) {
  const revenu_mensuel = Math.round(Number(revenu_annuel) / 12);
  return Math.max(PLAFOND.min, Math.min(revenu_mensuel, PLAFOND.max));
}

/**
 * Simulation cotisation affiliation volontaire.
 * @param {object} data - { revenu_annuel, assurance_maladie?, risque_professionnel?, vieillesse? }
 * @returns {{ revenu_annuel: number, revenu_mensuel: number, plafond: number, cotisation: number, montant_trimestriel: number }}
 */
function computeSimulation(data) {
  const revenu_annuel = Number(data.revenu_annuel) || 0;
  const plafond = getPlafondMensuel(revenu_annuel);
  const revenu_mensuel = Math.round(revenu_annuel / 12);

  let cotisation = 0;
  if (data.assurance_maladie) cotisation += plafond * RATES.assurance_maladie;
  if (data.risque_professionnel) cotisation += plafond * RATES.risque_professionnel;
  if (data.vieillesse) cotisation += plafond * RATES.vieillesse;

  return {
    revenu_annuel,
    revenu_mensuel,
    plafond,
    cotisation: Math.round(cotisation),
    montant_trimestriel: Math.round(cotisation * 3)
  };
}

/**
 * Mappe les champs du formulaire front vers le modèle (request_affiliation_volontaire).
 */
function mapRequestToModel(data_request) {
  return {
    ...data_request,
    date_naissance: data_request.date_of_birth ?? data_request.date_naissance,
    lieu_naissance: data_request.place_of_birth ?? data_request.lieu_naissance,
    sexe: data_request.gender ?? data_request.sexe,
    adresse: data_request.address ?? data_request.adresse,
    prenom: data_request.first_name ?? data_request.prenom,
    nom: data_request.last_name ?? data_request.nom,
    no_immatriculation: data_request.numero_immatriculation ?? data_request.no_immatriculation ?? null,
    cni_file_path: data_request.cni_file_path,
    requester_picture: data_request.requester_picture,
    certificat_residence_file: data_request.certificat_residence_file
  };
}

const utility = {
  findByNoImmatriculation: async (no_immatriculation) => {
    return await AffiliationVolontaire.findOne({ where: { no_immatriculation } });
  },

  findByEmail: async (email) => {
    return await AffiliationVolontaire.findOne({ where: { email } });
  },

  findByPhone: async (phone_number) => {
    return await AffiliationVolontaire.findOne({ where: { phone_number } });
  },

  PLAFOND,
  RATES,
  getPlafondMensuel,
  computeSimulation,
  mapRequestToModel
};

module.exports = utility;
