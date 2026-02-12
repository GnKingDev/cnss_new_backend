const RequestEmployeur = require('./model');

const migrate = async () => {
  try {
    await RequestEmployeur.sync({ alter: true });
    console.log('✅ RequestEmployeur table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating RequestEmployeur table:', error);
  }
};

module.exports = migrate;
