const Pays = require('./model');

const migrate = async () => {
  try {
    await Pays.sync({ alter: true });
    console.log('✅ Pays table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Pays table:', error);
  }
};

module.exports = migrate;
