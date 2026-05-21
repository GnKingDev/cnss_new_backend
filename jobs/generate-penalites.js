/**
 * Cron : matérialise / met à jour les lignes `penalites` (type RETARD_PAIEMENT).
 *
 * Règle : paiement au plus tard le 20 du mois suivant la période déclarée ;
 * chaque mois de retard après cette date : +5 % du montant initial (total_branche),
 * cumul linéaire (k mois → k × 5 % × base). Référence = date de paiement si payé, sinon aujourd’hui.
 *
 * Parcourt toutes les cotisations hors complémentaire. Idempotent.
 *
 * Usage :
 *   node jobs/generate-penalites.js
 *   node jobs/generate-penalites.js --dry-run
 *   npm run cron:penalites
 */
require('dotenv').config();
const path = require('path');
const { Op } = require('sequelize');

const root = path.join(__dirname, '..');
require(path.join(root, 'db', 'relations'));

const CotisationEmployeur = require(path.join(root, 'db', 'cotisation_employeur', 'model'));
const Paiement = require(path.join(root, 'db', 'paiement', 'model'));
const Penalite = require(path.join(root, 'db', 'penalites', 'model'));
const {
  dateLimitePaiement,
  calculerPenaliteRetardPaiement,
  TYPE_RETARD_PAIEMENT
} = require(path.join(root, 'db', 'penalites', 'penaliteRetardPaiement.util'));
const { upsertRetardPaiementPenalite } = require(path.join(root, 'db', 'penalites', 'utility'));

function periodeCompactFromDate(d) {
  const x = new Date(d);
  return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * @param {{ dryRun?: boolean, enableLog?: boolean }} options — `enableLog` défaut true (logs START/FIN + durée).
 */
async function runGeneratePenalites(options = {}) {
  const dryRun = options.dryRun === true;
  const enableLog = options.enableLog !== false;
  const tStart = Date.now();
  const progressEvery = Math.max(
    1,
    parseInt(process.env.PENALITES_PROGRESS_EVERY || '200', 10) || 200
  );
  const log = (...args) => {
    if (enableLog) console.log('[penalites job]', ...args);
  };

  log('▶ START', new Date().toISOString(), dryRun ? '(dry-run)' : '');

  try {
  log('↻ fetch cotisation_employeur START');
  const tFetch = Date.now();
  const cotisations = await CotisationEmployeur.findAll({
    where: {
      employeurId: { [Op.ne]: null },
      [Op.or]: [{ motif: { [Op.is]: null } }, { motif: { [Op.notLike]: '%COMPLEMENTAIRE%' } }]
    },
    attributes: ['id', 'employeurId', 'periode', 'trimestre', 'year', 'total_branche', 'total_cotisation']
  });
  log('↻ fetch cotisation_employeur FIN', `rows=${cotisations.length}`, `duration=${Date.now() - tFetch}ms`);

  let upserted = 0;
  let removed = 0;
  let skippedNoDeadline = 0;
  let skippedZeroBase = 0;
  let skippedPenaliteDejaPayee = 0;
  const errors = [];
  const totalCotisations = cotisations.length;
  let processed = 0;

  const logProgress = (cotisationId, outcome) => {
    if (!enableLog) return;
    const shouldLog =
      processed === 1 ||
      processed === totalCotisations ||
      processed % progressEvery === 0;
    if (!shouldLog) return;
    const elapsedMs = Date.now() - tStart;
    const pct = totalCotisations > 0
      ? ((processed / totalCotisations) * 100).toFixed(1)
      : '100.0';
    log(
      `… progress ${processed}/${totalCotisations} (${pct}%)`,
      `cotisationId=${cotisationId}`,
      `outcome=${outcome}`,
      `upsert=${upserted}`,
      `removed=${removed}`,
      `skip(noDeadline=${skippedNoDeadline},zeroBase=${skippedZeroBase},paidPenalite=${skippedPenaliteDejaPayee})`,
      `errors=${errors.length}`,
      `elapsed=${elapsedMs}ms`
    );
  };

  for (const c of cotisations) {
    processed += 1;
    try {
      const dateLim = dateLimitePaiement({
        periode: c.periode,
        trimestre: c.trimestre,
        year: c.year
      });

      if (!dateLim) {
        skippedNoDeadline++;
        logProgress(c.id, 'skip:noDeadline');
        continue;
      }

      // Base pénalité = total_branche (fallback legacy vers total_cotisation si total_branche absent)
      const montantBase = Number(c.total_branche ?? c.total_cotisation) || 0;
      if (montantBase <= 0) {
        skippedZeroBase++;
        logProgress(c.id, 'skip:zeroBase');
        continue;
      }

      const penExistante = await Penalite.findOne({
        where: { cotisation_employeurId: c.id, type_source: TYPE_RETARD_PAIEMENT }
      });
      if (penExistante && penExistante.is_paid) {
        skippedPenaliteDejaPayee++;
        logProgress(c.id, 'skip:penaliteDejaPayee');
        continue;
      }

      const paiement = await Paiement.findOne({
        where: { cotisation_employeurId: c.id },
        order: [['id', 'DESC']],
        attributes: ['id', 'is_paid', 'paiement_date', 'paid_date', 'updatedAt']
      });

      let dateReference = new Date();
      if (paiement && paiement.is_paid) {
        const pd = paiement.paiement_date || paiement.paid_date || paiement.updatedAt;
        dateReference = pd ? new Date(pd) : new Date();
      }

      const { k, montantPenalite, dateLimitePaiement: dlim } = calculerPenaliteRetardPaiement({
        montantBase,
        dateLimite: dateLim,
        dateReference
      });

      const periodeCompact = periodeCompactFromDate(dateLim);

      if (dryRun) {
        if (k > 0 && montantPenalite > 0) {
          console.log('[dry-run] upsert penalite RETARD_PAIEMENT', {
            cotisationId: c.id,
            employeurId: c.employeurId,
            montantBase,
            k,
            montantPenalite,
            dateLimite: dateLim.toISOString(),
            ref: dateReference.toISOString()
          });
          upserted++;
          logProgress(c.id, 'dryRun:upsert');
        } else {
          console.log('[dry-run] aucune penalite (k=0) ou suppression', { cotisationId: c.id, k });
          if (penExistante) removed++;
          logProgress(c.id, penExistante ? 'dryRun:remove' : 'dryRun:noop');
        }
        continue;
      }

      await upsertRetardPaiementPenalite({
        employeurId: c.employeurId,
        cotisation_employeurId: c.id,
        montantBase,
        k,
        montantPenalite,
        dateLimitePaiement: dlim,
        periodeCompact
      });

      const hadRow = !!penExistante;
      if (k > 0 && montantPenalite > 0) {
        upserted++;
      } else if (hadRow) {
        removed++;
      }

      await CotisationEmployeur.update(
        { is_penalite_applied: k > 0 && montantPenalite > 0, penelite_amount: 0 },
        { where: { id: c.id } }
      );
      logProgress(c.id, k > 0 && montantPenalite > 0 ? 'upsert' : (hadRow ? 'remove' : 'noop'));
    } catch (e) {
      const reason = e.message || String(e);
      errors.push({ cotisationId: c.id, reason });
      if (enableLog) {
        console.error('[penalites job] erreur ligne — on continue', { cotisationId: c.id, reason });
      }
      logProgress(c.id, 'error');
      continue;
    }
  }

  const durationMs = Date.now() - tStart;
  const result = {
    totalScanned: cotisations.length,
    upsertedOrUpdated: upserted,
    penalitesSupprimees: removed,
    durationMs,
    skipped: {
      noDeadline: skippedNoDeadline,
      zeroMontantBase: skippedZeroBase,
      penaliteDejaPayee: skippedPenaliteDejaPayee
    },
    ...(errors.length ? { errors } : {})
  };

  log(
    '■ FIN OK — job terminé',
    `${durationMs}ms`,
    '| scanned=',
    result.totalScanned,
    'upsert=',
    result.upsertedOrUpdated,
    'removed=',
    result.penalitesSupprimees,
    '| erreurs_ligne=',
    errors.length
  );
  if (errors.length && enableLog) {
    console.error('[penalites job] détail erreurs:', errors);
  }

  return result;
  } catch (err) {
    const durationMs = Date.now() - tStart;
    log('■ FIN ERREUR — job interrompu', `${durationMs}ms`, err.message || err);
    if (enableLog) console.error('[penalites job] stack:', err.stack);
    throw err;
  }
}

module.exports = { runGeneratePenalites };

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  runGeneratePenalites({ dryRun })
    .then((r) => {
      console.log(JSON.stringify({ ok: true, ...r }, null, 2));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
