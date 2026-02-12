const Employeur = require('./model');

const migrate = async () => {
  try {
    await Employeur.sync({ alter: true });
    console.log('✅ Employeur table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Employeur table:', error);
  }
};
migrate();

module.exports = migrate;
