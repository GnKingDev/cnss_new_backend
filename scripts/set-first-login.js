/**
 * Script : mettre first_login à true pour un utilisateur (employeur) par immatriculation.
 * Usage: node scripts/set-first-login.js [immatriculation]
 * Exemple: node scripts/set-first-login.js 8204000010400
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const Users = require(path.join(dbPath, 'users', 'model'));

const IMMAT = process.argv[2] || '8204000010400';

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  console.log('Mise à jour first_login = true pour identity:', IMMAT);
  console.log('---');

  try {
    const user = await Users.findOne({ where: { identity: IMMAT } });
    if (!user) {
      console.log('Aucun utilisateur trouvé pour identity =', IMMAT);
      await sequelize.close();
      process.exit(1);
    }

    await user.update({ first_login: true });
    console.log('✅ first_login mis à true pour', IMMAT, '(user id:', user.id, ')');
  } catch (err) {
    console.error('❌ Erreur:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
