const CotisationEmployeur = require('./model');

const migrate = async () => {
  try {
    await CotisationEmployeur.sync({ alter: true });
    console.log('✅ CotisationEmployeur table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating CotisationEmployeur table:', error);
  }
};

module.exports = migrate;
