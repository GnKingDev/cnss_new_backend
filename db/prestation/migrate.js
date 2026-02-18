const PrestationDemande = require('./model');
const PrestationDocument = require('./documentModel');

const migrate = async () => {
  try {
    await PrestationDemande.sync({ alter: true });
    console.log('✅ PrestationDemande (prestation_demandes) table migrated successfully');
    await PrestationDocument.sync({ alter: true });
    console.log('✅ PrestationDocument (prestation_documents) table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Prestation tables:', error);
  }
};
migrate();
module.exports = migrate;
