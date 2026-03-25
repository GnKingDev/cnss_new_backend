/**
 * Script : mettre à jour le revenu d'une affiliation volontaire (revenu_annuel, revenu_mensuel, plafond, cotisation, montant_trimestriel).
 * Utilise la même logique que la simulation (utility).
 *
 * Usage: node scripts/update-av-revenu.js [no_immatriculation]
 * Exemple: node scripts/update-av-revenu.js
 * Exemple: node scripts/update-av-revenu.js AV-20260305-3302
 *
 * Par défaut no_immatriculation = AV-20260305-3302.
 * Revenu cible : revenu annuel = 120 000 000 GNF. Revenu mensuel et cotisation calculés automatiquement.
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const AffiliationVolontaire = require(path.join(dbPath, 'affiliation-volontaire', 'model'));
const { computeSimulationFromAffiliation } = require(path.join(dbPath, 'affiliation-volontaire', 'utility'));

/** Revenu annuel cible (GNF) */
const REVENU_ANNUEL = 120_000_000;

const NO_IMMATRICULATION = process.argv[2] || 'AV-20260305-3302';

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  console.log('--- Mise à jour revenu affiliation volontaire ---\n');

  try {
    const affiliation = await AffiliationVolontaire.findOne({
      where: { no_immatriculation: NO_IMMATRICULATION }
    });
    if (!affiliation) {
      console.error('❌ Aucune affiliation trouvée pour no_immatriculation =', NO_IMMATRICULATION);
      process.exit(1);
    }

    const affRaw = affiliation.get ? affiliation.get({ plain: true }) : affiliation;
    const affAvecNouveauRevenu = { ...affRaw, revenu_annuel: REVENU_ANNUEL };
    const sim = computeSimulationFromAffiliation(affAvecNouveauRevenu);

    console.log('Revenu annuel cible :', REVENU_ANNUEL.toLocaleString('fr-FR'), 'GNF');
    console.log('Prestations actives : risque_prof.', !!affRaw.is_risque_professionnel_active, '| maladie', !!affRaw.is_assurance_maladie_active, '| vieillesse', !!affRaw.is_vieillesse_active);
    console.log('Revenu mensuel (calculé) :', sim.revenu_mensuel.toLocaleString('fr-FR'), 'GNF');
    console.log('Plafond :', sim.plafond.toLocaleString('fr-FR'), 'GNF');
    console.log('Cotisation mensuelle :', sim.cotisation.toLocaleString('fr-FR'), 'GNF');
    console.log('Montant trimestriel :', sim.montant_trimestriel.toLocaleString('fr-FR'), 'GNF');
    console.log('');

    await affiliation.update({
      revenu_annuel: sim.revenu_annuel,
      revenu_mensuel: sim.revenu_mensuel,
      plafond: sim.plafond,
      cotisation: sim.cotisation,
      montant_trimestriel: sim.montant_trimestriel
    });

    const row = affiliation.get ? affiliation.get({ plain: true }) : affiliation;
    console.log('✅ Affiliation mise à jour. Id:', row.id, '| N° immat.:', row.no_immatriculation);
    console.log('   revenu_annuel:', row.revenu_annuel, '| revenu_mensuel:', row.revenu_mensuel);
    console.log('   plafond:', row.plafond, '| cotisation:', row.cotisation, '| montant_trimestriel:', row.montant_trimestriel);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
