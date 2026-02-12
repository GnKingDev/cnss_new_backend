const Succursale = require('./model');

const migrate = async () => {
  try {
    await Succursale.sync({ alter: true });
    console.log('✅ Succursale table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Succursale table:', error);
  }
};

module.exports = migrate;
