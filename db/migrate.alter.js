/**
 * Migration des modèles avec alter: true
 * Met à jour les tables existantes pour correspondre aux modèles (ajoute colonnes, ajuste types).
 * Ne supprime pas les tables ni les données.
 * Corrige les lignes orphelines (FK vers un parent inexistant) avant alter pour éviter ER_NO_REFERENCED_ROW_2.
 *
 * Usage: node db/migrate.alter.js
 * ou: npm run migrate:alter
 */
require('dotenv').config();
const sequelize = require('./db.connection');

// Charger tous les modèles et relations (ordre des FK respecté par Sequelize)
require('./relations');

/** Met à NULL les FK orphelines (référence à un parent inexistant) pour éviter ER_NO_REFERENCED_ROW_2 au alter. */
async function fixOrphanedForeignKeys() {
  const tables = [
    { table: 'penalites', fk: 'employeurId', ref: 'Employeur' },
    { table: 'quitus', fk: 'employeurId', ref: 'Employeur' },
    { table: 'employes', fk: 'prefectureId', ref: 'prefecture' }
  ];
  for (const { table, fk, ref } of tables) {
    try {
      const [results] = await sequelize.query(`
        UPDATE \`${table}\` t
        LEFT JOIN \`${ref}\` p ON t.\`${fk}\` = p.id
        SET t.\`${fk}\` = NULL
        WHERE t.\`${fk}\` IS NOT NULL AND p.id IS NULL
      `);
      const affected = results?.affectedRows ?? 0;
      if (affected > 0) {
        console.log('⚠️  Lignes orphelines corrigées dans', table, `(${fk} -> NULL):`, affected);
      }
    } catch (err) {
      console.warn('⚠️  Correction orphelins', table, ':', err.message);
    }
  }
}

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion DB OK');
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  try {
    await fixOrphanedForeignKeys();
    await sequelize.sync({ alter: true });
    console.log('✅ Migration (alter: true) terminée pour tous les modèles');
  } catch (err) {
    console.error('❌ Erreur migration:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

migrate();
