const Quittance = require('./model');

const migrate = async () => {
  try {
    await Quittance.sync({ alter: true });
    console.log('✅ Quittance table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Quittance table:', error);
  }
};

module.exports = migrate;
