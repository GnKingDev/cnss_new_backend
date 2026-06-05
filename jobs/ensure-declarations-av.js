/**
 * Cron : génération automatique des déclarations trimestrielles AV.
 *
 * Parcourt tous les affiliés volontaires validés (is_validated = true)
 * et crée les déclarations trimestrielles manquantes pour chacun.
 * Idempotent — ne recrée jamais une déclaration déjà existante.
 *
 * Déclenchement recommandé (crontab) :
 *   0 6 1 1,4,7,10 *   → 1er jour de chaque trimestre à 6h00 (nouvelles déclarations)
 *   0 7 * * *           → tous les jours à 7h00 (rattrapage nouveaux affiliés)
 *
 * Usage manuel :
 *   node jobs/ensure-declarations-av.js
 *   node jobs/ensure-declarations-av.js --dry-run
 *   npm run cron:declarations-av
 *   npm run cron:declarations-av:dry
 */
require('dotenv').config();
const path = require('path');

const root = path.join(__dirname, '..');
require(path.join(root, 'db', 'relations'));

const AffiliationVolontaire = require(path.join(root, 'db', 'affiliation-volontaire', 'model'));
const { ensureDeclarationsForAffiliation } = require(path.join(root, 'db', 'declaration_affiliation_volontaire', 'ensure-declarations'));

async function runEnsureDeclarationsAv({ dryRun = false, enableLog = true } = {}) {
  const tStart = Date.now();
  const log = (...args) => { if (enableLog) console.log('[declarations-av]', ...args); };

  log('■ START', dryRun ? '(DRY RUN)' : '');

  // Tous les affiliés validés ayant un compte utilisateur AV
  const affiliations = await AffiliationVolontaire.findAll({
    where: { is_validated: true },
    attributes: ['id', 'validated_date', 'createdAt'],
  });

  log(`${affiliations.length} affilié(s) validé(s) trouvé(s)`);

  let totalCreated = 0;
  let totalSkipped = 0;
  const errors = [];

  for (const aff of affiliations) {
    const id = aff.id;
    try {
      if (dryRun) {
        log(`[dry] affiliationId=${id} — skip création`);
        totalSkipped++;
        continue;
      }
      const { created } = await ensureDeclarationsForAffiliation(id);
      if (created > 0) {
        log(`affiliationId=${id} → ${created} déclaration(s) créée(s)`);
        totalCreated += created;
      }
    } catch (err) {
      errors.push({ affiliationId: id, message: err.message });
      log(`affiliationId=${id} ERREUR:`, err.message);
    }
  }

  const durationMs = Date.now() - tStart;
  const result = {
    totalAffiliations: affiliations.length,
    totalCreated,
    totalSkipped,
    durationMs,
    ...(errors.length ? { errors } : {}),
  };

  log(
    '■ FIN OK',
    `${durationMs}ms`,
    '| affiliations=', affiliations.length,
    '| créées=', totalCreated,
    '| erreurs=', errors.length
  );

  if (errors.length && enableLog) {
    console.error('[declarations-av] détail erreurs:', errors);
  }

  return result;
}

module.exports = { runEnsureDeclarationsAv };

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  runEnsureDeclarationsAv({ dryRun })
    .then((r) => {
      console.log(JSON.stringify({ ok: true, ...r }, null, 2));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
