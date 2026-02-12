const Activity = require('./model');

const migrate = async () => {
  try {
    await Activity.sync({ alter: true });
    console.log('✅ Activity table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Activity table:', error);
  }
};

module.exports = migrate;
