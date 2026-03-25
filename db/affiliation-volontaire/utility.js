const AffiliationVolontaire = require('./model');

/** Plafond affiliation volontaire (GNF). Revenu mensuel borné entre min et max (accueil, télédéclaration). */
const PLAFOND = { min: 550000, max: 2500000 };

/** Taux par prestation (défaut). La cotisation = plafond × (somme des taux des prestations actives). */
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
 * Simulation cotisation affiliation volontaire (route POST /simulation).
 * Cotisation = plafond × (somme des taux des prestations actives : assurance_maladie, risque_professionnel, vieillesse).
 * @param {object} data - { revenu_annuel, assurance_maladie?, risque_professionnel?, vieillesse? }
 * @returns {{ revenu_annuel: number, revenu_mensuel: number, plafond: number, cotisation: number, montant_trimestriel: number }}
 */
function computeSimulation(data) {
  const revenu_annuel = Number(data.revenu_annuel) || 0;
  const revenu_mensuel = Math.round(revenu_annuel / 12);
  const plafond = getPlafondMensuel(revenu_annuel);
  let cotisation = 0;
  if (data.assurance_maladie) cotisation += plafond * RATES.assurance_maladie;
  if (data.risque_professionnel) cotisation += plafond * RATES.risque_professionnel;
  if (data.vieillesse) cotisation += plafond * RATES.vieillesse;
  cotisation = Math.round(cotisation);

  return {
    revenu_annuel,
    revenu_mensuel,
    plafond,
    cotisation,
    montant_trimestriel: cotisation * 3
  };
}

/**
 * Même calcul que computeSimulation, à partir d'un enregistrement affiliation_volontaire.
 * Cotisation = plafond × (somme des taux des prestations actives choisies par l'affilié).
 * @param {object} affiliation - instance ou plain { revenu_annuel, is_assurance_maladie_active?, assurance_maladie_percentage?, ... }
 * @returns {{ revenu_annuel: number, revenu_mensuel: number, plafond: number, cotisation: number, montant_trimestriel: number }}
 */
function computeSimulationFromAffiliation(affiliation) {
  const a = affiliation?.get ? affiliation.get({ plain: true }) : affiliation || {};
  const revenu_annuel = Number(a.revenu_annuel) || 0;
  const revenu_mensuel = Math.round(revenu_annuel / 12);
  const plafond = getPlafondMensuel(revenu_annuel);
  const toRate = (v) => (v == null ? null : (Number(v) > 1 ? Number(v) / 100 : Number(v)));
  const rateMaladie = toRate(a.assurance_maladie_percentage) ?? RATES.assurance_maladie;
  const rateRisque = toRate(a.risque_professionnel_percentage) ?? RATES.risque_professionnel;
  const rateVieillesse = toRate(a.vieillesse_percentage) ?? RATES.vieillesse;
  let cotisation = 0;
  if (a.is_assurance_maladie_active) cotisation += plafond * rateMaladie;
  if (a.is_risque_professionnel_active) cotisation += plafond * rateRisque;
  if (a.is_vieillesse_active) cotisation += plafond * rateVieillesse;
  cotisation = Math.round(cotisation);

  return {
    revenu_annuel,
    revenu_mensuel,
    plafond,
    cotisation,
    montant_trimestriel: cotisation * 3
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
  computeSimulationFromAffiliation,
  mapRequestToModel
};

module.exports = utility;
