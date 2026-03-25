const DeclarationAffiliationVolontaire = require('./model');

DeclarationAffiliationVolontaire.sync({ alter: true })
  .then(() => console.log('✅ Table declaration_affiliation_volontaire migrée'))
  .catch((err) => console.error('Erreur migration:', err));
