/**
 * Script : créer un utilisateur admin employeur pour un employeur par immatriculation.
 * Usage: node scripts/create-admin-employeur.js [immatriculation] [mot_de_passe]
 * Exemple: node scripts/create-admin-employeur.js 8204000010400
 * Exemple: node scripts/create-admin-employeur.js 8204000010400 MonMotDePasse123
 *
 * Si le mot de passe est omis, un mot de passe aléatoire sera généré et affiché.
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const Users = require(path.join(dbPath, 'users', 'model'));
const Employeur = require(path.join(dbPath, 'XYemployeurs', 'model'));
const userUtil = require(path.join(dbPath, 'users', 'utility'));

const IMMAT = process.argv[2] || '8204000010400';
const PASSWORD = process.argv[3];

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  console.log('--- Création utilisateur admin employeur ---');
  console.log('Immatriculation employeur:', IMMAT);

  try {
    const employeur = await Employeur.findOne({
      where: { no_immatriculation: IMMAT }
    });
    if (!employeur) {
      console.error('❌ Employeur non trouvé pour no_immatriculation =', IMMAT);
      await sequelize.close();
      process.exit(1);
    }
    console.log('Employeur trouvé:', employeur.raison_sociale, '(id:', employeur.id, ')');

    let user = await Users.findOne({
      where: { identity: IMMAT }
    });

    const password = PASSWORD || userUtil.generateUniqueCode(10);
    const passwordHashed = await userUtil.hashPassword(password);

    if (user) {
      await user.update({
        type: 'admin',
        role: 'employeur',
        password: passwordHashed,
        user_id: employeur.id,
        user_identify: IMMAT,
        can_work: true,
        first_login: PASSWORD ? user.first_login : true
      });
      console.log('✅ Utilisateur mis à jour (type=admin, role=employeur). Id:', user.id);
    } else {
      user = await Users.create({
        user_identify: IMMAT,
        identity: IMMAT,
        role: 'employeur',
        type: 'admin',
        password: passwordHashed,
        user_id: employeur.id,
        full_name: employeur.raison_sociale || `Admin ${IMMAT}`,
        email: employeur.email || null,
        phone_number: employeur.phone_number || null,
        first_login: true,
        can_work: true
      });
      console.log('✅ Utilisateur créé (type=admin, role=employeur). Id:', user.id);
    }

    if (!PASSWORD) {
      console.log('');
      console.log('⚠️  Mot de passe généré (à sauvegarder) :', password);
      console.log('');
    }
    console.log('Identifiant de connexion :', IMMAT);
  } catch (err) {
    console.error('❌ Erreur:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
