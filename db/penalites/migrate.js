const Penalite = require('./model');

const migrate = async () => {
  try {
    await Penalite.sync({ alter: true });
    console.log('✅ Penalite table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Penalite table:', error);
  }
};

module.exports = migrate;
