const Carer = require('./model');

const migrate = async () => {
  try {
    await Carer.sync({ alter: true });
    console.log('✅ Carer table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Carer table:', error);
  }
};

module.exports = migrate;
