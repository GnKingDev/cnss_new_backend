const Conjoint = require('./model');

const migrate = async () => {
  try {
    await Conjoint.sync({ alter: true });
    console.log('✅ Conjoint table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Conjoint table:', error);
  }
};
migrate();
module.exports = migrate;
