/**
 * Script : lister les comptes admin ayant un matricule renseigné.
 * Table : dirgas (module db/admin).
 *
 * Usage:
 *   node scripts/list-admins-with-matricule.js
 *   node scripts/list-admins-with-matricule.js --role agent
 *   node scripts/list-admins-with-matricule.js --actif
 */
require('dotenv').config();
const path = require('path');
const { Op } = require('sequelize');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const DirgaU = require(path.join(dbPath, 'admin', 'model'));

// Options CLI
const args = process.argv.slice(2);
const roleIndex = args.indexOf('--role');
const filterRole = roleIndex !== -1 ? args[roleIndex + 1] : null;
const filterActif = args.includes('--actif');

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  const where = {
    matricule: { [Op.not]: null }
  };

  if (filterRole) where.type = filterRole;
  if (filterActif) where.can_work = true;

  const admins = await DirgaU.findAll({
    where,
    attributes: ['id', 'matricule', 'first_name', 'last_name', 'email', 'type', 'service', 'can_work', 'last_login'],
    order: [['matricule', 'ASC']]
  });

  if (admins.length === 0) {
    console.log('Aucun compte admin avec matricule trouvé.');
    await sequelize.close();
    return;
  }

  console.log(`\n${admins.length} compte(s) trouvé(s) :\n`);
  console.log(
    'ID'.padEnd(6) +
    'Matricule'.padEnd(12) +
    'Nom'.padEnd(28) +
    'Email'.padEnd(35) +
    'Rôle'.padEnd(16) +
    'Service'.padEnd(25) +
    'Actif'.padEnd(7) +
    'Dernière connexion'
  );
  console.log('-'.repeat(135));

  for (const a of admins) {
    const nom = `${a.first_name} ${a.last_name || ''}`.trim();
    const lastLogin = a.last_login ? new Date(a.last_login).toLocaleString('fr-FR') : 'jamais';
    console.log(
      String(a.id).padEnd(6) +
      (a.matricule || '').padEnd(12) +
      nom.padEnd(28) +
      (a.email || '').padEnd(35) +
      (a.type || '').padEnd(16) +
      (a.service || '').padEnd(25) +
      (a.can_work ? 'oui' : 'non').padEnd(7) +
      lastLogin
    );
  }

  console.log('');
  await sequelize.close();
}

main();
