const DemandeAccesEmploye = require('./model');

const migrate = async () => {
  try {
    await DemandeAccesEmploye.sync({ alter: true });
    console.log('✅ DemandeAccesEmploye table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating DemandeAccesEmploye table:', error);
  }
};
migrate();

module.exports = migrate;
