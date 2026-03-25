/**
 * Script : activer les trois prestations (risque professionnel, assurance maladie, vieillesse) pour une affiliation volontaire.
 *
 * Usage: node scripts/activate-av-prestations.js [no_immatriculation]
 * Exemple: node scripts/activate-av-prestations.js
 * Exemple: node scripts/activate-av-prestations.js AV-20260305-3302
 *
 * Par défaut no_immatriculation = AV-20260305-3302.
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const AffiliationVolontaire = require(path.join(dbPath, 'affiliation-volontaire', 'model'));

const NO_IMMATRICULATION = process.argv[2] || 'AV-20260305-3302';

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  console.log('--- Activer prestations affiliation volontaire ---\n');

  try {
    const affiliation = await AffiliationVolontaire.findOne({
      where: { no_immatriculation: NO_IMMATRICULATION }
    });
    if (!affiliation) {
      console.error('❌ Aucune affiliation trouvée pour no_immatriculation =', NO_IMMATRICULATION);
      process.exit(1);
    }

    await affiliation.update({
      is_risque_professionnel_active: true,
      is_assurance_maladie_active: true,
      is_vieillesse_active: true
    });

    const row = affiliation.get ? affiliation.get({ plain: true }) : affiliation;
    console.log('✅ Prestations activées. Id:', row.id, '| N° immat.:', row.no_immatriculation);
    console.log('   is_risque_professionnel_active:', row.is_risque_professionnel_active);
    console.log('   is_assurance_maladie_active:', row.is_assurance_maladie_active);
    console.log('   is_vieillesse_active:', row.is_vieillesse_active);
    console.log('\nRelancez node scripts/update-av-revenu.js pour recalculer la cotisation.');
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
