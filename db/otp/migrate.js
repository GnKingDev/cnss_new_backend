const Otp = require('./model');

const migrate = async () => {
  try {
    await Otp.sync({ alter: true });
    console.log('✅ Otp table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Otp table:', error);
  }
};

module.exports = migrate;
