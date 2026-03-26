/**
 * Script : afficher les affiliations volontaires et réinitialiser le mot de passe.
 *
 * Usage:
 *   node scripts/reset-av-password.js                        → liste toutes les AV
 *   node scripts/reset-av-password.js <identifiant>          → reset password à 1234hjlo
 *   node scripts/reset-av-password.js <identifiant> <mdp>   → reset password au mdp fourni
 *
 * <identifiant> = user_identify (ex: AV-20250101-1234) ou id numérique du UserAV
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const AffiliationVolontaire = require(path.join(dbPath, 'affiliation-volontaire', 'model'));
const UserAV = require(path.join(dbPath, 'user_affiliation_volontaire', 'model'));
const avUtil = require(path.join(dbPath, 'user_affiliation_volontaire', 'utility'));

const IDENTIFIER = process.argv[2];
const NEW_PASSWORD = process.argv[3] || '1234hjlo';

async function listAll() {
  const users = await UserAV.findAll({
    include: [{ model: AffiliationVolontaire, as: 'affiliationVolontaire' }],
    order: [['id', 'ASC']]
  });

  if (!users.length) {
    console.log('Aucune affiliation volontaire trouvée.');
    return;
  }

  console.log(`\n${'─'.repeat(90)}`);
  console.log(
    'ID UserAV'.padEnd(12) +
    'user_identify'.padEnd(28) +
    'Nom & Prénom'.padEnd(28) +
    'Statut'.padEnd(12) +
    'Email'
  );
  console.log('─'.repeat(90));

  for (const u of users) {
    const av = u.affiliationVolontaire || {};
    const nom = `${av.nom || ''} ${av.prenom || ''}`.trim() || '-';
    const statut = av.status || '-';
    const email = av.email || '-';
    console.log(
      String(u.id).padEnd(12) +
      (u.user_identify || '-').padEnd(28) +
      nom.substring(0, 26).padEnd(28) +
      statut.padEnd(12) +
      email
    );
  }
  console.log('─'.repeat(90));
  console.log(`Total : ${users.length} affiliation(s)\n`);
}

async function resetPassword() {
  const { Op } = require('sequelize');

  let user;
  if (IDENTIFIER) {
    user = await UserAV.findOne({
      where: {
        [Op.or]: [
          { user_identify: IDENTIFIER.trim() },
          ...(isNaN(parseInt(IDENTIFIER, 10)) ? [] : [{ id: parseInt(IDENTIFIER, 10) }])
        ]
      },
      include: [{ model: AffiliationVolontaire, as: 'affiliationVolontaire' }]
    });
  } else {
    // Aucun identifiant fourni → prendre le premier
    user = await UserAV.findOne({
      include: [{ model: AffiliationVolontaire, as: 'affiliationVolontaire' }],
      order: [['id', 'ASC']]
    });
  }

  if (!user) {
    console.error('❌ Aucun utilisateur AV trouvé en base.');
    process.exit(1);
  }

  const av = user.affiliationVolontaire || {};
  console.log('\nUtilisateur trouvé :');
  console.log(`  ID UserAV      : ${user.id}`);
  console.log(`  user_identify  : ${user.user_identify}`);
  console.log(`  Nom & Prénom   : ${av.nom || ''} ${av.prenom || ''}`);
  console.log(`  Email          : ${av.email || '-'}`);
  console.log(`  Statut         : ${av.status || '-'}`);

  const hashed = await avUtil.hashPassword(NEW_PASSWORD);
  await user.update({ password: hashed, first_login: true });

  console.log(`\n✅ Mot de passe réinitialisé à : ${NEW_PASSWORD}`);
  console.log(`   (first_login remis à true — l'utilisateur devra changer son mot de passe)`);
}

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  try {
    if (IDENTIFIER === 'list' || IDENTIFIER === '--list') {
      await listAll();
    } else {
      await resetPassword();
    }
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
