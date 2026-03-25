const QuitusDemande = require('./model');

const migrate = async () => {
  try {
    await QuitusDemande.sync({ alter: true });
    console.log('✅ QuitusDemande (quitus_demandes) table migrated successfully');
  } catch (error) {
    console.error('❌ Error migrating Quitus menu table:', error);
  }
};
migrate();
module.exports = migrate; 
