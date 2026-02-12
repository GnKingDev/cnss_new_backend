const DirgaU = require('./model');

const migrate = async () => {
  try {
    await DirgaU.sync({ alter: true });
    console.log('✅ DirgaU table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating DirgaU table:', error);
  }
};

module.exports = migrate;
