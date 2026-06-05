/**
 * Génération automatique des déclarations trimestrielles pour un affilié volontaire.
 * Périodicité : 1 déclaration par trimestre (90 j).
 * Prorata : le 1er trimestre est calculé au prorata des jours restants / 90.
 */
const AffiliationVolontaire = require('../affiliation-volontaire/model');
const DeclarationAffiliationVolontaire = require('./model');
const sessionService = require('../../services/session.service');
const { sendMailAppelCotisationAv } = require('../../utility2');
const { computeSimulationFromAffiliation } = require('../affiliation-volontaire/utility');

// ─── Définition des trimestres ───────────────────────────────────────────────

const QUARTERS = [
  { q: 1, label: 'Jan-Fév-Mar', startMonth: 1, endMonth: 3  },
  { q: 2, label: 'Avr-Mai-Jun', startMonth: 4, endMonth: 6  },
  { q: 3, label: 'Jul-Aoû-Sep', startMonth: 7, endMonth: 9  },
  { q: 4, label: 'Oct-Nov-Déc', startMonth: 10, endMonth: 12 },
];

/** Retourne le trimestre (0-based index) pour un mois donné (1-12). */
function qIndexForMonth(month) {
  return Math.floor((month - 1) / 3); // 0,1,2,3
}

/**
 * Liste des trimestres à assurer, du trimestre de validation jusqu'au trimestre courant.
 * @param {Date|string} validatedDate
 * @returns {{ year: number, periode: string, qDef: object, isFirst: boolean }[]}
 */
function getQuarterList(validatedDate) {
  const start = new Date(validatedDate);
  const now   = new Date();

  let y    = start.getFullYear();
  let qIdx = qIndexForMonth(start.getMonth() + 1);

  const currentYear = now.getFullYear();
  const currentQIdx = qIndexForMonth(now.getMonth() + 1);

  const out = [];
  let first = true;

  while (y < currentYear || (y === currentYear && qIdx <= currentQIdx)) {
    out.push({ year: y, periode: QUARTERS[qIdx].label, qDef: QUARTERS[qIdx], isFirst: first });
    first = false;
    qIdx++;
    if (qIdx >= 4) { qIdx = 0; y++; }
  }

  return out;
}

/**
 * Calcule le montant trimestriel proraté pour le 1er trimestre.
 * Jours restants = du jour de validation jusqu'au dernier jour du trimestre (inclus).
 * Base = 90 jours.
 */
function computeProrata(validatedDate, qDef, year, cotisationTrimestrielle) {
  const start = new Date(validatedDate);
  start.setHours(0, 0, 0, 0);
  // Premier jour du trimestre suivant = lendemain du dernier jour de ce trimestre
  const endPlusOne = new Date(year, qDef.endMonth, 1); // ex: 1er Avril pour T1
  const msPerDay = 86400000;
  const daysRemaining = Math.round((endPlusOne - start) / msPerDay);
  const days = Math.min(Math.max(daysRemaining, 1), 90);
  return Math.round(cotisationTrimestrielle * days / 90);
}

// ─── SMS notification ────────────────────────────────────────────────────────

function sendSmsDeclarationAv(phone_number, periode, year) {
  if (!phone_number) return;
  fetch('https://api.passeinfo.com/v1/message/single_message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'client-id': `${process.env.client_id}`,
      'api-key':   `${process.env.api_key}`,
    },
    body: JSON.stringify({
      senderName: 'CNSS GUINEE',
      message:    `CNSS - Une declaration de cotisation a ete generee dans votre compte pour le trimestre ${periode} ${year}. Connectez-vous sur votre espace pour effectuer le paiement.`,
      contact:    `${phone_number}`,
    }),
  })
    .then(async (res) => {
      if (!res.ok) console.warn('[AV SMS Decl] non envoyé:', res.status, await res.text());
      else console.log('[AV SMS Decl] envoyé vers', phone_number);
    })
    .catch((err) => console.error('[AV SMS Decl] erreur:', err.message));
}

// ─── Fonction principale ─────────────────────────────────────────────────────

const QUARTERS_BACK = 8; // ~2 ans de trimestres (utilisé pour les affiliations sans date)

/**
 * Assure les déclarations trimestrielles pour une affiliation.
 * Crée les trimestres manquants depuis la date de validation jusqu'au trimestre courant.
 * @param {number} affiliationVolontaireId
 * @returns {Promise<{ created: number }>}
 */
async function ensureDeclarationsForAffiliation(affiliationVolontaireId) {
  const affiliation = await AffiliationVolontaire.findByPk(affiliationVolontaireId);
  if (!affiliation) return { created: 0 };

  const affRaw = affiliation.get ? affiliation.get({ plain: true }) : affiliation;
  const sim             = computeSimulationFromAffiliation(affRaw);
  const cotisationTrim  = sim.montant_trimestriel;
  const revenuAnnuelAff = sim.revenu_annuel;
  const revenuMensuelAff = sim.plafond; // plafond borné 550 000–2 500 000 GNF

  // Date de référence : validated_date ou createdAt en fallback
  const refDate = affRaw.validated_date || affRaw.createdAt || new Date();

  const toEnsure = getQuarterList(refDate);

  const existing = await DeclarationAffiliationVolontaire.findAll({
    where: { affiliationVolontaireId },
    order: [['year', 'DESC'], ['periode', 'DESC']]
  });
  const byKey = new Map();
  existing.forEach((d) => byKey.set(`${d.year}-${d.periode}`, d));

  let created = 0;

  for (const { year, periode, qDef, isFirst } of toEnsure) {
    const k = `${year}-${periode}`;
    if (byKey.has(k)) {
      if (sessionService.isAvailable()) {
        await sessionService.setDeclarationAutoAv(affiliationVolontaireId, year, periode);
      }
      continue;
    }

    const montant = isFirst
      ? computeProrata(refDate, qDef, year, cotisationTrim)
      : cotisationTrim;

    const [row, wasCreated] = await DeclarationAffiliationVolontaire.findOrCreate({
      where: { affiliationVolontaireId, year, periode },
      defaults: {
        affiliationVolontaireId,
        year,
        periode,
        montant_cotisation: montant,
        revenu_mensuel: revenuMensuelAff,
        revenu_annuel: revenuAnnuelAff,
        is_paid: false
      }
    });
    byKey.set(k, row);
    created++;

    if (wasCreated) {
      const declRaw = row.get ? row.get({ plain: true }) : row;
      sendMailAppelCotisationAv(affRaw, declRaw).catch((e) =>
        console.error('[EnsureDecl] Erreur envoi mail:', e.message)
      );
      sendSmsDeclarationAv(affRaw.phone_number, periode, year);
    }

    if (sessionService.isAvailable()) {
      await sessionService.setDeclarationAutoAv(affiliationVolontaireId, year, periode);
    }
  }

  return { created };
}

module.exports = {
  getQuarterList,
  ensureDeclarationsForAffiliation,
  QUARTERS,
  QUARTERS_BACK
};
