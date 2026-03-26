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

/**
 * Corrige automatiquement toutes les FK orphelines de la base en interrogeant information_schema.
 * Met à NULL toute valeur qui ne correspond à aucune ligne du parent.
 * Ignore les colonnes NOT NULL (ne peuvent pas être mises à NULL).
 */
async function fixOrphanedForeignKeys() {
  // Récupère le nom de la base depuis la connexion
  const dbName = sequelize.config.database;

  // Récupère toutes les FK de la base (sauf celles sur des colonnes NOT NULL)
  const fks = await sequelize.query(`
    SELECT
      kcu.TABLE_NAME   AS childTable,
      kcu.COLUMN_NAME  AS childCol,
      kcu.REFERENCED_TABLE_NAME  AS parentTable,
      kcu.REFERENCED_COLUMN_NAME AS parentCol
    FROM information_schema.KEY_COLUMN_USAGE kcu
    JOIN information_schema.COLUMNS c
      ON c.TABLE_SCHEMA = kcu.TABLE_SCHEMA
      AND c.TABLE_NAME  = kcu.TABLE_NAME
      AND c.COLUMN_NAME = kcu.COLUMN_NAME
    WHERE kcu.TABLE_SCHEMA = :db
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      AND c.IS_NULLABLE = 'YES'
    ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME
  `, { replacements: { db: dbName }, type: sequelize.QueryTypes.SELECT });

  for (const { childTable, childCol, parentTable, parentCol } of fks) {
    try {
      const [results] = await sequelize.query(`
        UPDATE \`${childTable}\` t
        LEFT JOIN \`${parentTable}\` p ON t.\`${childCol}\` = p.\`${parentCol}\`
        SET t.\`${childCol}\` = NULL
        WHERE t.\`${childCol}\` IS NOT NULL AND p.\`${parentCol}\` IS NULL
      `);
      const affected = results?.affectedRows ?? 0;
      if (affected > 0) {
        console.log(`⚠️  Orphelins corrigés : ${childTable}.${childCol} → ${parentTable} (${affected} lignes)`);
      }
    } catch (err) {
      console.warn(`⚠️  Correction orphelins ${childTable}.${childCol} :`, err.message);
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
