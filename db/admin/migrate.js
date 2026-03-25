const DirgaU = require('./model');

const migrate = async () => {
  try {
    await DirgaU.sync({ alter: true });
    console.log('✅ Admin (DirgaU) table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Admin table:', error);
  }
};
migrate();
module.exports = migrate;
  