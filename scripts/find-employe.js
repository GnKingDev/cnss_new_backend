/**
 * Script : afficher le premier employé (ordre id ASC).
 * Usage: node scripts/find-employe.js
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const Employe = require(path.join(dbPath, 'employe', 'model'));

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  console.log('Premier employé (id le plus petit):');
  console.log('---');

  try {
    const employe = await Employe.findOne({
      order: [['id', 'ASC']],
      raw: true
    });
    if (employe) {
      console.log(JSON.stringify(employe, null, 2));
    } else {
      console.log('Aucun employé en base.');
    }
  } catch (err) {
    console.error('❌ Erreur:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
