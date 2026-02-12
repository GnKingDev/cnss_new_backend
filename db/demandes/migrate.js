const Demande = require('./model');

const migrate = async () => {
  try {
    await Demande.sync({ alter: true });
    console.log('✅ Demande table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Demande table:', error);
  }
};

module.exports = migrate;
