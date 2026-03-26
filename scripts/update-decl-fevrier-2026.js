/**
 * Met à jour le montant_cotisation des déclarations FÉVRIER 2026 à 5000 GNF.
 * Usage: node scripts/update-decl-fevrier-2026.js
 *        node scripts/update-decl-fevrier-2026.js --affiliationId=<id>  (pour un seul affilié)
 */
require('dotenv').config();
const sequelize = require('../db/db.connection');
const DeclarationAffiliationVolontaire = require('../db/declaration_affiliation_volontaire/model');

const args = process.argv.slice(2);
const affiliationArg = args.find(a => a.startsWith('--affiliationId='));
const affiliationId = affiliationArg ? parseInt(affiliationArg.split('=')[1]) : null;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion BDD OK');

    const where = { year: 2026, periode: '02' };
    if (affiliationId) where.affiliationVolontaireId = affiliationId;

    const declarations = await DeclarationAffiliationVolontaire.findAll({ where });

    if (declarations.length === 0) {
      console.log('❌ Aucune déclaration FÉVRIER 2026 trouvée.');
      return;
    }

    console.log(`🔍 ${declarations.length} déclaration(s) trouvée(s) pour FÉVRIER 2026`);

    for (const decl of declarations) {
      const ancien = decl.montant_cotisation;
      await decl.update({ montant_cotisation: 5000 });
      console.log(`  ✅ ID=${decl.id} affiliationId=${decl.affiliationVolontaireId} : ${ancien} → 5000 GNF`);
    }

    console.log('\n✅ Mise à jour terminée.');
  } catch (err) {
    console.error('❌ Erreur:', err.message);
  } finally {
    await sequelize.close();
  }
})();
