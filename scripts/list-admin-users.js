/**
 * Script : lister tous les comptes admin (portail BO).
 * Table : dirgas (module db/admin).
 *
 * Usage:
 *   node scripts/list-admin-users.js
 *   node scripts/list-admin-users.js --type admin
 *   node scripts/list-admin-users.js --type directeur
 *   node scripts/list-admin-users.js --all        (inclut inactifs)
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const DirgaU = require(path.join(dbPath, 'admin', 'model'));

const args = process.argv.slice(2);
const typeFilter = args.includes('--type') ? args[args.indexOf('--type') + 1] : null;
const showAll = args.includes('--all');

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  const where = {};
  if (typeFilter) where.type = typeFilter;
  if (!showAll) where.can_work = true;

  const admins = await DirgaU.findAll({
    where,
    attributes: ['id', 'matricule', 'first_name', 'last_name', 'email', 'telephone', 'type', 'service', 'can_work', 'permissions', 'last_login', 'createdAt'],
    order: [['type', 'ASC'], ['createdAt', 'ASC']]
  });

  if (admins.length === 0) {
    console.log('Aucun compte trouvé.');
    await sequelize.close();
    return;
  }

  console.log(`\n${'─'.repeat(80)}`);
  console.log(`  COMPTES BO — Table: dirgas${typeFilter ? `  [type: ${typeFilter}]` : ''}${showAll ? '  [tous]' : '  [actifs seulement]'}`);
  console.log(`  Total : ${admins.length} compte(s)`);
  console.log(`${'─'.repeat(80)}\n`);

  for (const a of admins) {
    const status = a.can_work ? '✅ Actif' : '🔴 Inactif';
    const lastLogin = a.last_login ? new Date(a.last_login).toLocaleString('fr-FR') : 'jamais';
    const createdAt = new Date(a.createdAt).toLocaleDateString('fr-FR');
    const permissions = Array.isArray(a.permissions) && a.permissions.length
      ? a.permissions.join(', ')
      : '—';

    console.log(`  [${a.id}] ${a.matricule || '(pas de matricule)'}`);
    console.log(`       Nom       : ${a.first_name} ${a.last_name || ''}`);
    console.log(`       Email     : ${a.email}`);
    console.log(`       Téléphone : ${a.telephone || '—'}`);
    console.log(`       Rôle      : ${a.type}`);
    console.log(`       Service   : ${a.service || '—'}`);
    console.log(`       Statut    : ${status}`);
    console.log(`       Permissions: ${permissions}`);
    console.log(`       Dernier login : ${lastLogin}`);
    console.log(`       Créé le   : ${createdAt}`);
    console.log();
  }

  console.log(`${'─'.repeat(80)}\n`);
  await sequelize.close();
}

main();
