const Prefecture = require('./model');

const migrate = async () => {
  try {
    await Prefecture.sync({ alter: true });
    console.log('✅ Prefecture table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Prefecture table:', error);
  }
};

module.exports = migrate;
