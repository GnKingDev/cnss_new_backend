/**
 * Script : supprimer les cotisations orphelines (employeurId inexistant).
 *
 * Contexte :
 * - Les erreurs FK sur penalites (penalites_ibfk_2) arrivent quand on tente
 *   d'insérer une pénalité avec un employeurId qui n'existe plus.
 * - Ce script nettoie les lignes orphelines dans `cotisation_employeurs`.
 *
 * Usage :
 *   node scripts/delete-orphan-cotisations.js
 *   node scripts/delete-orphan-cotisations.js --execute
 *   node scripts/delete-orphan-cotisations.js --execute --limit=100
 *
 * Par défaut : DRY-RUN (aucune suppression).
 * Pour supprimer réellement : ajouter --execute.
 */

require('dotenv').config();
const path = require('path');
const { QueryTypes } = require('sequelize');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));

const EXECUTE = process.argv.includes('--execute');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 100) : 100;

function escapeIdentifier(name) {
  return String(name).replace(/`/g, '``');
}

async function getReferencedEmployeurTable() {
  const rows = await sequelize.query(
    `
      SELECT kcu.REFERENCED_TABLE_NAME AS referencedTable
      FROM information_schema.KEY_COLUMN_USAGE kcu
      WHERE kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.TABLE_NAME = 'penalites'
        AND kcu.CONSTRAINT_NAME = 'penalites_ibfk_2'
      LIMIT 1
    `,
    { type: QueryTypes.SELECT }
  );

  if (rows[0] && rows[0].referencedTable) {
    return rows[0].referencedTable;
  }

  // Fallback courant dans le code Sequelize
  return 'Employeurs';
}

async function main() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion DB OK');

    const referencedTable = await getReferencedEmployeurTable();
    const refSafe = escapeIdentifier(referencedTable);
    console.log(`ℹ️ Table employeur référencée (FK): ${referencedTable}`);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM cotisation_employeurs c
      LEFT JOIN \`${refSafe}\` e ON e.id = c.employeurId
      WHERE c.employeurId IS NOT NULL
        AND e.id IS NULL
    `;

    const countRows = await sequelize.query(countSql, { type: QueryTypes.SELECT });
    const total = Number(countRows[0]?.total || 0);
    console.log(`📊 Cotisations orphelines détectées: ${total}`);

    if (total === 0) {
      console.log('✅ Rien à supprimer.');
      process.exit(0);
    }

    const previewSql = `
      SELECT c.id, c.employeurId, c.periode, c.trimestre, c.year, c.total_branche, c.createdAt
      FROM cotisation_employeurs c
      LEFT JOIN \`${refSafe}\` e ON e.id = c.employeurId
      WHERE c.employeurId IS NOT NULL
        AND e.id IS NULL
      ORDER BY c.id ASC
      LIMIT ${LIMIT}
    `;

    const preview = await sequelize.query(previewSql, { type: QueryTypes.SELECT });
    console.log(`🔎 Aperçu (max ${LIMIT} lignes):`);
    console.table(preview);

    if (!EXECUTE) {
      console.log('\n⚠️ DRY-RUN: aucune suppression effectuée.');
      console.log('➡️ Relance avec --execute pour supprimer réellement ces lignes.');
      process.exit(0);
    }

    const deleteSql = `
      DELETE c
      FROM cotisation_employeurs c
      LEFT JOIN \`${refSafe}\` e ON e.id = c.employeurId
      WHERE c.employeurId IS NOT NULL
        AND e.id IS NULL
    `;

    const result = await sequelize.query(deleteSql, { type: QueryTypes.DELETE });
    const deleted = Array.isArray(result) ? Number(result[1] || 0) : Number(result || 0);

    console.log(`🧹 Suppression terminée. Lignes supprimées: ${deleted}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur script:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close().catch(() => {});
  }
}

main();
