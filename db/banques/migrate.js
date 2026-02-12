const Banque = require('./model');

const migrate = async () => {
  try {
    await Banque.sync({ alter: true });
    console.log('✅ Banque table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Banque table:', error);
  }
};

module.exports = migrate;
