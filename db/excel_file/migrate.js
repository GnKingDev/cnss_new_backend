const ExcelFile = require('./model');

const migrate = async () => {
  try {
    await ExcelFile.sync({ alter: true });
    console.log('✅ ExcelFile table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating ExcelFile table:', error);
  }
};

module.exports = migrate;
