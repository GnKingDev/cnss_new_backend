const UserAffiliationVolontaire = require("./model");

UserAffiliationVolontaire.sync({ alter: true }).then(() => {
  console.log('✅ UserAffiliationVolontaire table migrated successfully');
}).catch((err) => {
  console.error('Error migrating UserAffiliationVolontaire table:', err);
});