const Document = require('./model');

const migrate = async () => {
  try {
    await Document.sync({ alter: true });
    console.log('✅ Document table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Document table:', error);
  }
};
migrate();
module.exports = migrate;
