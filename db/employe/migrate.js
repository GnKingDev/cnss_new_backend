const Employe = require('./model');

const migrate = async () => {
  try {
    await Employe.sync({ alter: true });
    console.log('✅ Employe table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Employe table:', error);
  }
};

module.exports = migrate;
