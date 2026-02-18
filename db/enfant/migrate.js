const Enfant = require('./model');

const migrate = async () => {
  try {
    await Enfant.sync({ alter: true });
    console.log('✅ Enfant table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Enfant table:', error);
  }
};
migrate();
module.exports = migrate;
