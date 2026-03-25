/**
 * Script : afficher la liste des préfectures et des branches (vérification uniquement, pas d'insertion).
 * Tables utilisées : prefecture (modèle Prefecture), branches.
 *
 * Usage: node scripts/list-prefectures-branches.js
 */
require('dotenv').config();
const path = require('path');
const Prefecture = require('../db/prefecture/model');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));

const Branche = require(path.join(dbPath, 'branches', 'model'));

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  console.log('--- Liste préfectures et branches ---\n');

  try {
    const prefectures = await Prefecture.findAll({
      order: [['id', 'ASC']],
      attributes: ['id', 'name', 'code']
    });
    console.log('Préfectures (table prefecture) :', prefectures.length, 'ligne(s)');
    if (prefectures.length === 0) { 
      console.log('  (aucune)\n');
    } else {
      prefectures.forEach((p) => {
        const row = p.get ? p.get({ plain: true }) : p;
        console.log('  id:', row.id, '| name:', row.name, '| code:', row.code ?? '—');
      });
      console.log('');
    }

    const branches = await Branche.findAll({
      order: [['id', 'ASC']],
      attributes: ['id', 'name', 'code']
    });
    console.log('Branches (table branches) :', branches.length, 'ligne(s)');
    if (branches.length === 0) {
      console.log('  (aucune)\n');
    } else {
      branches.forEach((b) => {
        const row = b.get ? b.get({ plain: true }) : b;
        console.log('  id:', row.id, '| name:', row.name, '| code:', row.code ?? '—');
      });
      console.log('');
    }
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
