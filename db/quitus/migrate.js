const Quitus = require('./model');

const migrate = async () => {
  try {
    await Quitus.sync({ alter: true });
    console.log('✅ Quitus table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Quitus table:', error);
  }
};

module.exports = migrate;
