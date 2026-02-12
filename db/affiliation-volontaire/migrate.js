const AffiliationVolontaire = require('./model');

const migrate = async () => {
  try {
    await AffiliationVolontaire.sync({ alter: true });
    console.log('✅ AffiliationVolontaire table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating AffiliationVolontaire table:', error);
  }
};

module.exports = migrate;
