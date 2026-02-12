const Adhesion = require('./model');

const migrate = async () => {
  try {
    await Adhesion.sync({ alter: true });
    console.log('✅ Adhesion table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Adhesion table:', error);
  }
};

module.exports = migrate;
