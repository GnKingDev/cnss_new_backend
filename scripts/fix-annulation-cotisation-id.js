/**
 * Script : associer cotisation_employeur_id = 1 à la première demande annulation
 * Usage  : node scripts/fix-annulation-cotisation-id.js
 */

require('dotenv').config();
const sequelize = require('../db/db.connection');
const ReclamationDemande = require('../db/reclamation/model');

(async () => {
  try {
    await sequelize.authenticate();

    const demande = await ReclamationDemande.findOne({
      where: { type: 'annulation' },
      order: [['id', 'ASC']],
    });

    if (!demande) {
      console.log('❌ Aucune demande de type annulation trouvée.');
      process.exit(1);
    }

    console.log(`📋 Demande trouvée : id=${demande.id}, référence=${demande.reference}, cotisation_employeur_id actuel=${demande.cotisation_employeur_id}`);

    await demande.update({ cotisation_employeur_id: 1 });

    console.log(`✅ cotisation_employeur_id mis à jour → 1 pour la demande id=${demande.id}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
  }
})();
