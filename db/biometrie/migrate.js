const BiometrieDemande = require('./model');
const BiometrieAgence = require('./agenceModel');
const Employe = require('../employe/model');

const migrate = async () => {
  try {
    await Employe.sync({ alter: true });
    console.log('✅ Employe (champs biométriques) mis à jour');
    await BiometrieDemande.sync({ alter: true });
    console.log('✅ BiometrieDemande (biometrie_demandes) table migrated successfully');
    await BiometrieAgence.sync({ alter: true });
    console.log('✅ BiometrieAgence (biometrie_agences) table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Biometrie tables:', error);
  }
};

migrate();
module.exports = migrate;
