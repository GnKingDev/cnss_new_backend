const Paiement = require('./model');

const migrate = async () => {
  try {
    await Paiement.sync({ alter: true });
    console.log('✅ Paiement table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Paiement table:', error);
  }
};

module.exports = migrate;
