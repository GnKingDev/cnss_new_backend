/**
 * Script : réinitialiser le mot de passe d'un compte admin (portail BO).
 * Table : dirgas (module db/admin).
 *
 * Usage:
 *   node scripts/reset-admin-password.js <email_ou_matricule> <nouveau_mot_de_passe>
 *
 * Exemples:
 *   node scripts/reset-admin-password.js admin@cnss.gov.gn 12345678
 *   node scripts/reset-admin-password.js ADM-001 12345678
 */
require('dotenv').config();
const path = require('path');
const { Op } = require('sequelize');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const DirgaU = require(path.join(dbPath, 'admin', 'model'));
const userUtil = require(path.join(dbPath, 'users', 'utility'));

const IDENTIFIER = process.argv[2];
const NEW_PASSWORD = process.argv[3];

if (!IDENTIFIER || !NEW_PASSWORD) {
  console.error('❌ Usage: node scripts/reset-admin-password.js <email_ou_matricule> <nouveau_mot_de_passe>');
  process.exit(1);
}

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  const admin = await DirgaU.findOne({
    where: {
      [Op.or]: [
        { email: IDENTIFIER.trim().toLowerCase() },
        { matricule: IDENTIFIER.trim().toUpperCase() }
      ]
    }
  });

  if (!admin) {
    console.error(`❌ Aucun compte trouvé pour : ${IDENTIFIER}`);
    await sequelize.close();
    process.exit(1);
  }

  console.log(`\nCompte trouvé :`);
  console.log(`  Id        : ${admin.id}`);
  console.log(`  Matricule : ${admin.matricule}`);
  console.log(`  Email     : ${admin.email}`);
  console.log(`  Nom       : ${admin.first_name} ${admin.last_name || ''}`);
  console.log(`  Rôle      : ${admin.type}`);

  const passwordHashed = await userUtil.hashPassword(NEW_PASSWORD);
  await admin.update({ password: passwordHashed });

  console.log(`\n✅ Mot de passe réinitialisé avec succès.`);
  console.log(`   Connectez-vous avec : ${admin.email} ou ${admin.matricule}`);

  await sequelize.close();
}

main();
