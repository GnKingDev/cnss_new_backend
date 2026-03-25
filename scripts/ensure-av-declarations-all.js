/**
 * Génération automatique des déclarations (12 derniers mois) pour tous les affiliés volontaires.
 * À lancer après déploiement ou en cron (ex. mensuel) pour que chaque affilié ait ses déclarations.
 *
 * Usage: node scripts/ensure-av-declarations-all.js
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const AffiliationVolontaire = require(path.join(dbPath, 'affiliation-volontaire', 'model'));
const { ensureDeclarationsForAffiliation } = require(path.join(dbPath, 'declaration_affiliation_volontaire', 'ensure-declarations'));

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  console.log('--- Génération automatique des déclarations pour tous les affiliés volontaires ---\n');

  try {
    const affiliations = await AffiliationVolontaire.findAll({
      attributes: ['id', 'no_immatriculation', 'nom', 'prenom'],
      order: [['id', 'ASC']]
    });
    console.log('Affiliés trouvés :', affiliations.length);
    if (affiliations.length === 0) {
      console.log('Aucune affiliation à traiter.');
      await sequelize.close();
      return;
    }

    let totalCreated = 0;
    for (const aff of affiliations) {
      const row = aff.get ? aff.get({ plain: true }) : aff;
      const { created } = await ensureDeclarationsForAffiliation(row.id);
      totalCreated += created;
      if (created > 0) {
        console.log('  Id', row.id, '|', row.no_immatriculation ?? '—', '|', created, 'ligne(s) créée(s)');
      }
    }
    console.log('\n✅ Total déclarations créées :', totalCreated);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
