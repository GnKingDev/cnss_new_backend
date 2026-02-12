const CotisationEmployeur = require('./model');

/** Mois et périodes (13e, 14e, 15e mois) */
const MONTHS = [
  { name: 'JANVIER', id: 0, code: '01' },
  { name: 'FEVRIER', id: 1, code: '02' },
  { name: 'MARS', id: 2, code: '03' },
  { name: 'AVRIL', id: 3, code: '04' },
  { name: 'MAI', id: 4, code: '05' },
  { name: 'JUIN', id: 5, code: '06' },
  { name: 'JUILLET', id: 6, code: '07' },
  { name: 'AOUT', id: 7, code: '08' },
  { name: 'SEPTEMBRE', id: 8, code: '09' },
  { name: 'OCTOBRE', id: 9, code: '10' },
  { name: 'NOVEMBRE', id: 10, code: '11' },
  { name: 'DECEMBRE', id: 11, code: '12' },
  { name: '13e MOIS', id: 11, code: '12' },
  { name: '14e MOIS', id: 11, code: '12' },
  { name: '15e MOIS', id: 11, code: '12' }
];

/** Plafonds salaire soumis cotisation par année (FCFA) */
const PLAFOND = {
  min: 550000,
  maxBefore2019: 1500000,
  maxFrom2019: 2500000
};

/** Taux de cotisation */
const RATES = {
  employe: 0.05,
  employeur: 0.18,
  totalNormal: 0.23,
  stagiaireApprenti: 0.04,
  prestationFamiliale: 0.06,
  assuranceMaladie: 0.065,
  risqueProfessionnel: 0.04,
  vieillesse: 0.065,
  penalite: 0.05
};

/**
 * Vérifie si la date du jour est après le 20 du mois (échéance déclaration).
 * @param {Date} [refDate=new Date()] - Date de référence
 * @returns {boolean}
 */
function hasPassed20th(refDate = new Date()) {
  return refDate.getDate() > 20;
}

/**
 * Calcule le salaire soumis à cotisation (plafonné par année).
 * @param {number} salary - Salaire brut
 * @param {string|number} year - Année
 * @returns {number}
 */
function getSalarySoumisCotisation(salary, year) {
  if (!salary || salary <= 0) return 0;
  const y = parseInt(year, 10);
  const max = y > 2018 ? PLAFOND.maxFrom2019 : PLAFOND.maxBefore2019;
  return Math.max(PLAFOND.min, Math.min(salary, max));
}

/**
 * Calcule les cotisations employé / employeur selon le type de contrat.
 * @param {number} plafond - Salaire soumis cotisation
 * @param {string} typeContrat - "Stagiaire" | "Apprenti" | autre
 * @returns {{ cotisation_employe: number, cotisation_emplyeur: number, total_cotisation: number }}
 */
function getCotisationForEmployee(plafond, typeContrat) {
  const isStagiaireOrApprenti = typeContrat === 'Stagiaire' || typeContrat === 'Apprenti';
  if (isStagiaireOrApprenti) {
    const cotisation_emplyeur = Math.round(plafond * RATES.stagiaireApprenti);
    return {
      cotisation_employe: 0,
      cotisation_emplyeur,
      total_cotisation: cotisation_emplyeur
    };
  }
  return {
    cotisation_employe: Math.round(plafond * RATES.employe),
    cotisation_emplyeur: Math.round(plafond * RATES.employeur),
    total_cotisation: Math.round(plafond * RATES.totalNormal)
  };
}

/**
 * Calcule les montants par branche (prestation familiale, assurance maladie, etc.).
 * @param {number} totalSalarySoumisCotisation
 * @param {number} sscStagiaireApprentis - Somme des SSC des stagiaires/apprentis (exclus de certaines branches)
 */
function computeBranches(totalSalarySoumisCotisation, sscStagiaireApprentis = 0) {
  const base = totalSalarySoumisCotisation - sscStagiaireApprentis;
  return {
    prestation_familiale: Math.round(base * RATES.prestationFamiliale),
    assurance_maladie: Math.round(base * RATES.assuranceMaladie),
    risque_professionnel: Math.round(totalSalarySoumisCotisation * RATES.risqueProfessionnel),
    vieillesse: Math.round(base * RATES.vieillesse),
    get total_branche() {
      return this.prestation_familiale + this.assurance_maladie + this.risque_professionnel + this.vieillesse;
    }
  };
}

/**
 * Montant pénalité (5 % du total branche) si déclaration après le 20.
 * @param {number} totalBranche
 * @returns {number}
 */
function getPenaliteAmount(totalBranche) {
  return Math.round(totalBranche * RATES.penalite);
}

/**
 * Vérifie si la période est déjà déclarée pour l'employeur.
 */
async function isPeriodeDeclared(periode, year, employeurId) {
  if (!periode) return false;
  const existing = await CotisationEmployeur.findOne({
    where: { periode, year, employeurId }
  });
  return !!existing;
}

/**
 * Vérifie si le trimestre est déjà déclaré.
 */
async function isTrimestreDeclared(trimestre, year, employeurId = null) {
  if (!trimestre) return false;
  const where = { trimestre, year };
  if (employeurId != null) where.employeurId = employeurId;
  const existing = await CotisationEmployeur.findOne({ where });
  return !!existing;
}

/**
 * Objet de base pour les réponses facture / calcul.
 */
function buildSendDataBase(year, periode, options = {}) {
  return {
    year,
    periode: periode || null,
    trimestre: options.trimestre || null,
    effectif_embauche: 0,
    effectif_leave: 0,
    current_effectif: 0,
    total_salary: 0,
    total_salary_soumis_cotisation: 0,
    total_cotisation_employe: 0,
    total_cotisation_employeur: 0,
    total_cotisation: 0,
    prestation_familiale: 0,
    risque_professionnel: 0,
    assurance_maladie: 0,
    vieillesse: 0,
    total_branche: 0,
    is_penalite_applied: false,
    penelite_amount: 0,
    ...options
  };
}

/**
 * Trouve l'entrée mois par nom (JANVIER, 13e MOIS, etc.).
 */
function getMonthByName(periodeName) {
  return MONTHS.find((m) => m.name === periodeName);
}

const utility = {
  findByEmployeur: async (employeurId) => {
    return await CotisationEmployeur.findAll({ where: { employeurId } });
  },

  findByPeriode: async (periode, year, employeurId) => {
    return await CotisationEmployeur.findOne({
      where: { periode, year, employeurId }
    });
  },

  findByTrimestre: async (trimestre, year, employeurId) => {
    return await CotisationEmployeur.findOne({
      where: { trimestre, year, employeurId }
    });
  },

  MONTHS,
  RATES,
  PLAFOND,
  hasPassed20th,
  getSalarySoumisCotisation,
  getCotisationForEmployee,
  computeBranches,
  getPenaliteAmount,
  isPeriodeDeclared,
  isTrimestreDeclared,
  buildSendDataBase,
  getMonthByName
};

module.exports = utility;
