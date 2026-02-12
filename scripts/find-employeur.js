/**
 * Script : afficher le premier employeur (ordre id ASC).
 * Usage: node scripts/find-employeur.js
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const Employeur = require(path.join(dbPath, 'XYemployeurs', 'model'));

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  console.log('Premier employeur (id le plus petit):');
  console.log('---');

  try {
    const employeur = await Employeur.findOne({
      order: [['id', 'ASC']],
      raw: true
    });
    if (employeur) {
      console.log(JSON.stringify(employeur, null, 2));
    } else {
      console.log('Aucun employeur en base.');
    }
  } catch (err) {
    console.error('❌ Erreur:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
