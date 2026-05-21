const Penalite = require('./model');
const {
  TYPE_RETARD_PAIEMENT
} = require('./penaliteRetardPaiement.util');

/**
 * Crée ou met à jour la pénalité de retard de paiement (5 % × mois sur montant déclaré).
 */
async function upsertRetardPaiementPenalite(opts) {
  const {
    employeurId,
    cotisation_employeurId,
    montantBase,
    k,
    montantPenalite,
    dateLimitePaiement,
    periodeCompact,
    motif
  } = opts;

  if (montantPenalite <= 0 || k <= 0) {
    const existing = await Penalite.findOne({
      where: { cotisation_employeurId, type_source: TYPE_RETARD_PAIEMENT }
    });
    if (existing) await existing.destroy();
    return null;
  }

  const payload = {
    employeurId,
    cotisation_employeurId,
    type_source: TYPE_RETARD_PAIEMENT,
    montant: montantPenalite,
    montant_base: montantBase,
    mois_retard: k,
    date_limite_paiement: dateLimitePaiement,
    periode: periodeCompact || null,
    motif: motif || `Pénalité retard de paiement (${k} mois × 5 % du montant cotisation déclaré)`,
    status: 'Nouveau',
    data_penalite: new Date(),
    is_paid: false
  };

  const [row, created] = await Penalite.findOrCreate({
    where: { cotisation_employeurId, type_source: TYPE_RETARD_PAIEMENT },
    defaults: payload
  });

  if (!created) {
    await row.update(payload);
  }
  return row;
}

/**
 * Pénalité de retard de déclaration : ligne indépendante dans `penalites`, payée à part de la cotisation.
 * @param {object} opts
 * @param {number} opts.employeurId
 * @param {number} opts.cotisation_employeurId
 * @param {number} opts.montant - déjà calculé (ex. 5 % du total branche)
 * @param {string|number} opts.year
 * @param {string} opts.monthCode - "01".."12"
 * @param {string} [opts.periodeLabel] - ex. JANVIER (affichage)
 */
async function createPenaliteDeclarationTardive(opts) {
  const { employeurId, cotisation_employeurId, montant, year, monthCode, periodeLabel } = opts;
  if (!montant || montant <= 0) return null;
  const y = String(year);
  const mc = String(monthCode).padStart(2, '0');
  const periodeCompact = `${y}${mc}`;
  const motif = periodeLabel
    ? `Pénalité pour déclaration tardive — ${periodeLabel} ${y}`
    : 'Pénalité pour déclaration tardive (après échéance)';
  return Penalite.create({
    employeurId,
    cotisation_employeurId,
    montant,
    periode: periodeCompact,
    motif,
    status: 'Nouveau',
    data_penalite: new Date(),
    is_paid: false
  });
}

const utility = {
  findByEmployeur: async (employeurId) => {
    return await Penalite.findAll({ where: { employeurId } });
  },

  findByStatus: async (status) => {
    return await Penalite.findAll({ where: { status } });
  },

  createPenaliteDeclarationTardive,
  upsertRetardPaiementPenalite
};

module.exports = utility;
