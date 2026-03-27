/**
 * Génère et enregistre la quittance AV après confirmation de paiement.
 * Appelé par le webhook Djomy et par PATCH /declarations/:id/pay.
 */

const QuittanceAffiliationVolontaire = require('./model');
const AffiliationVolontaire = require('../affiliation-volontaire/model');
const DeclarationAffiliationVolontaire = require('../declaration_affiliation_volontaire/model');
const { generateQuittanceAv } = require('../../services/quittance-av.service');

/** Génère un code alphanumérique unique */
function generateCode(length = 9) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Génère et sauvegarde la quittance pour une déclaration AV payée.
 * Idempotent : si une quittance existe déjà pour cette déclaration, retourne la quittance existante.
 *
 * @param {number} declarationId
 * @returns {Promise<QuittanceAffiliationVolontaire|null>}
 */
async function generateQuittanceForDeclaration(declarationId) {
  try {
    // Vérifier si une quittance existe déjà
    const existing = await QuittanceAffiliationVolontaire.findOne({ where: { declarationId } });
    if (existing) return existing;

    const declaration = await DeclarationAffiliationVolontaire.findByPk(declarationId);
    if (!declaration || !declaration.is_paid) return null;

    const affiliation = await AffiliationVolontaire.findByPk(declaration.affiliationVolontaireId);
    if (!affiliation) return null;

    const declRaw = declaration.get ? declaration.get({ plain: true }) : declaration;
    const avRaw   = affiliation.get ? affiliation.get({ plain: true }) : affiliation;

    const code = generateCode(9);
    const imma = avRaw.no_immatriculation || `AV-${avRaw.id}`;
    const reference = `${imma}-${declRaw.periode}-${declRaw.year}`;

    // Pas de stockage sur disque — le PDF est généré à la volée à chaque téléchargement
    const quittance = await QuittanceAffiliationVolontaire.create({
      affiliationVolontaireId: avRaw.id,
      declarationId: declRaw.id,
      reference,
      secret_code: code,
      doc_path: null,
      montant: declRaw.montant_cotisation || 0,
      periode: declRaw.periode,
      year: declRaw.year,
      payment_method: declRaw.payment_method,
      djomy_transaction_id: declRaw.djomy_transaction_id
    });

    console.log(`[QuittanceAV] Quittance #${quittance.id} enregistrée (déclaration #${declarationId}) — PDF généré à la demande`);
    return quittance;
  } catch (err) {
    console.error(`[QuittanceAV] Erreur génération quittance pour déclaration #${declarationId}:`, err.message);
    return null;
  }
}

module.exports = { generateQuittanceForDeclaration };
