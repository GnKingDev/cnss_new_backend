const ReclamationDemande = require('./model');

const migrate = async () => {
  try {
    await ReclamationDemande.sync({ alter: true });
    console.log('✅ ReclamationDemande (reclamation_demandes) table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Reclamation table:', error);
  }
};
migrate();
module.exports = migrate;
