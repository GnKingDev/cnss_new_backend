const Demploye = require('./model');

const migrate = async () => {
  try {
    await Demploye.sync({ alter: true });
    console.log('✅ Demploye table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Demploye table:', error);
  }
};

module.exports = migrate;
