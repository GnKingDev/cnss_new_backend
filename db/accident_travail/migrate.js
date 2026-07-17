const AccidentTravail = require('./model');

const migrate = async () => {
  try {
    await AccidentTravail.sync({ alter: true });
    console.log('✅ AccidentTravail (accident_travail_demandes) table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating AccidentTravail table:', error);
  }
};
migrate()
module.exports = migrate;
