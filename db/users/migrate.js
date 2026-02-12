const Users = require('./model');

const migrate = async () => {
  try {
    await Users.sync({ alter: true });
    console.log('✅ Users table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Users table:', error);
  }
};
migrate();
module.exports = migrate;
