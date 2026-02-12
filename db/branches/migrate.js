const Branche = require('./model');

const migrate = async () => {
  try {
    await Branche.sync({ alter: true });
    console.log('✅ Branche table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Branche table:', error);
  }
};

module.exports = migrate;
