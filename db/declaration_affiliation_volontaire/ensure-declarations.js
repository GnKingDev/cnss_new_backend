/**
 * Génération automatique des déclarations (une par mois) pour un affilié volontaire.
 * Utilisé à l'inscription et par GET /declarations ; peut être appelé pour tous les affiliés (script/cron).
 */
const AffiliationVolontaire = require('../affiliation-volontaire/model');
const DeclarationAffiliationVolontaire = require('./model');
const sessionService = require('../../services/session.service');

const MONTHS_BACK = 12;

function getYearMonthList(count = MONTHS_BACK) {
  const out = [];
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  for (let i = 0; i < count; i++) {
    out.push({ year: y, periode: String(m).padStart(2, '0') });
    m--;
    if (m < 1) { m = 12; y--; }
  }
  return out;
}

/**
 * Assure les déclarations pour les 12 derniers mois pour une affiliation.
 * Crée les lignes manquantes en base et enregistre en Redis (av:declaration:auto:...).
 * @param {number} affiliationVolontaireId
 * @returns {Promise<{ created: number }>} nombre de lignes créées
 */
async function ensureDeclarationsForAffiliation(affiliationVolontaireId) {
  const affiliation = await AffiliationVolontaire.findByPk(affiliationVolontaireId);
  if (!affiliation) return { created: 0 };

  const affRaw = affiliation.get ? affiliation.get({ plain: true }) : affiliation;
  const cotisationAff = Number(affRaw.cotisation) || 0;
  const revenuAnnuelAff = Number(affRaw.revenu_annuel) || 0;
  const revenuMensuelAff = Number(affRaw.revenu_mensuel) || Math.round(revenuAnnuelAff / 12);

  const existing = await DeclarationAffiliationVolontaire.findAll({
    where: { affiliationVolontaireId },
    order: [['year', 'DESC'], ['periode', 'DESC']]
  });
  const key = (y, p) => `${y}-${p}`;
  const byKey = new Map();
  existing.forEach((d) => byKey.set(key(d.year, d.periode), d));

  const toEnsure = getYearMonthList(MONTHS_BACK);
  let created = 0;
  for (const { year, periode } of toEnsure) {
    if (byKey.has(key(year, periode))) {
      if (sessionService.isAvailable()) {
        await sessionService.setDeclarationAutoAv(affiliationVolontaireId, year, periode);
      }
      continue;
    }
    const [row] = await DeclarationAffiliationVolontaire.findOrCreate({
      where: { affiliationVolontaireId, year, periode },
      defaults: {
        affiliationVolontaireId,
        year,
        periode,
        montant_cotisation: cotisationAff,
        revenu_mensuel: revenuMensuelAff,
        revenu_annuel: revenuAnnuelAff,
        is_paid: false
      }
    });
    byKey.set(key(year, periode), row);
    created++;
    if (sessionService.isAvailable()) {
      await sessionService.setDeclarationAutoAv(affiliationVolontaireId, year, periode);
    }
  }
  if (sessionService.isAvailable()) {
    for (const { year, periode } of toEnsure) {
      await sessionService.setDeclarationAutoAv(affiliationVolontaireId, year, periode);
    }
  }
  return { created };
}

module.exports = {
  getYearMonthList,
  ensureDeclarationsForAffiliation,
  MONTHS_BACK
};
