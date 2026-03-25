const sequelize = require('../db.connection');

/**
 * Migration paiements : ajoute uniquement les colonnes manquantes (payment_reference, atd_proof_paths).
 * On n'utilise pas sync({ alter: true }) car des lignes peuvent avoir un userId invalide
 * (non présent dans users), ce qui ferait échouer la contrainte FK sur userId.
 */
const migrate = async () => {
  try {
    const qi = sequelize.getQueryInterface();
    const table = 'paiements';
    const desc = await qi.describeTable(table);
    if (!desc.payment_reference) {
      await qi.addColumn(table, 'payment_reference', {
        type: sequelize.Sequelize.STRING,
        allowNull: true
      });
    }
    if (!desc.atd_proof_paths) {
      await qi.addColumn(table, 'atd_proof_paths', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true
      });
    }
    console.log('✅ Paiement table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Paiement table:', error);
  }
};
migrate();
module.exports = migrate;
