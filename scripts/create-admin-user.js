/**
 * Script : créer un compte admin (portail BO) avec accès à tout.
 * Table : dirgas (module db/admin).
 *
 * Usage:
 *   node scripts/create-admin-user.js
 *   node scripts/create-admin-user.js admin@cnss.gov.gn
 *   node scripts/create-admin-user.js admin@cnss.gov.gn MonMotDePasse123!
 *
 * Si email ou mot de passe sont omis, des valeurs par défaut sont utilisées
 * (voir ci-dessous). Le mot de passe doit respecter les critères (majuscule,
 * minuscule, chiffre, caractère spécial, 8+ caractères).
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const DirgaU = require(path.join(dbPath, 'admin', 'model'));
const userUtil = require(path.join(dbPath, 'users', 'utility'));

const DEFAULT_EMAIL = process.env.ADMIN_DEFAULT_EMAIL || 'admin@cnss.gov.gn';
const DEFAULT_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@2026';

const EMAIL = process.argv[2] || DEFAULT_EMAIL;
const PASSWORD = process.argv[3] || DEFAULT_PASSWORD;

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  console.log('--- Création compte admin (portail BO) ---\n');

  const existing = await DirgaU.findOne({
    where: { email: EMAIL.trim().toLowerCase() }
  });

  if (existing) {
    console.log('Un utilisateur avec cet email existe déjà (id:', existing.id, ', matricule:', existing.matricule, ').');
    const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
      readline.question('Mettre à jour le mot de passe et garantir rôle admin ? (oui/non) ', resolve);
    });
    readline.close();
    if (answer.toLowerCase() !== 'oui' && answer.toLowerCase() !== 'o') {
      console.log('Annulé.');
      await sequelize.close();
      process.exit(0);
    }
    const passwordHashed = await userUtil.hashPassword(PASSWORD);
    await existing.update({
      password: passwordHashed,
      type: 'admin',
      permissions: ['all'],
      can_work: true,
      matricule: existing.matricule || 'ADM-001'
    });
    console.log('✅ Compte admin mis à jour. Email:', existing.email, '| Matricule:', existing.matricule);
    console.log('   Mot de passe mis à jour. Connectez-vous au BO avec cet email ou ce matricule.');
    await sequelize.close();
    process.exit(0);
  }

  let matricule = 'ADM-001';
  const existingAdm = await DirgaU.findOne({ where: { matricule } });
  if (existingAdm) {
    const count = await DirgaU.count({ where: { type: 'admin' } });
    matricule = `ADM-${String(count + 1).padStart(3, '0')}`;
  }
  const passwordHashed = await userUtil.hashPassword(PASSWORD);

  try {
    const admin = await DirgaU.create({
      matricule,
      first_name: 'Admin',
      last_name: 'CNSS',
      email: EMAIL.trim().toLowerCase(),
      password: passwordHashed,
      type: 'admin',
      permissions: ['all'],
      can_work: true,
      service: 'Direction Générale'
    });
    console.log('✅ Compte admin créé.');
    console.log('   Id:', admin.id);
    console.log('   Email:', admin.email);
    console.log('   Matricule:', admin.matricule);
    console.log('   Rôle: admin (accès à tout)');
    console.log('\n   Connectez-vous au portail BO avec :');
    console.log('   - Identifiant :', admin.email, 'ou', admin.matricule);
    console.log('   - Mot de passe : (celui fourni en argument ou par défaut)');
    if (!process.argv[3]) {
      console.log('\n   Mot de passe utilisé :', PASSWORD);
    }
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    if (err.name === 'SequelizeUniqueConstraintError') {
      console.error('   (Un compte avec ce matricule ou email existe peut-être déjà.)');
    }
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
