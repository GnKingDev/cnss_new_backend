/**
 * Script : créer une affiliation volontaire + utilisateur de connexion (portail AV).
 * Active is_risque_professionnel_active sur l'affiliation.
 *
 * Usage: node scripts/create-av-user.js [mot_de_passe]
 * Exemple: node scripts/create-av-user.js
 * Exemple: node scripts/create-av-user.js MonMotDePasse123
 *
 * Si le mot de passe est omis, un mot de passe aléatoire sera généré et affiché.
 * Données créées : affiliation_volontaire + user_affiliation_volontaire (user_identify = no_immatriculation).
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const AffiliationVolontaire = require(path.join(dbPath, 'affiliation-volontaire', 'model'));
const UserAffiliationVolontaire = require(path.join(dbPath, 'user_affiliation_volontaire', 'model'));
const avUtil = require(path.join(dbPath, 'user_affiliation_volontaire', 'utility'));
const userUtil2 = require(path.join(dbPath, 'users', 'utility2'));
const { ensureDeclarationsForAffiliation } = require(path.join(dbPath, 'declaration_affiliation_volontaire', 'ensure-declarations'));

const PASSWORD = process.argv[2];

function generateNoImmatriculation() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const r = String(Math.floor(1000 + Math.random() * 9000));
  return `AV-${yyyy}${mm}${dd}-${r}`;
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  console.log('--- Création affiliation volontaire + utilisateur AV ---\n');

  const no_immatriculation = generateNoImmatriculation();
  const password = PASSWORD || generatePassword();
  const passwordHashed = await avUtil.hashPassword(password);
  const otpSecret = userUtil2.generateOtpSecret();

  try {
    const affiliation = await AffiliationVolontaire.create({
      nom: 'Diallo',
      prenom: 'Mamadou',
      date_naissance: new Date('1985-06-15'),
      lieu_naissance: 'Conakry',
      sexe: 'Masculin',
      adresse: 'Kaloum, Conakry',
      phone_number: '624123456',
      email: `av-${no_immatriculation.replace(/-/g, '').toLowerCase()}@example.gn`,
      profession: 'Commerçant',
      status: 'Valide',
      is_validated: true,
      validated_date: new Date(),
      is_risque_professionnel_active: true,
      risque_professionnel_percentage: 0.04,
      is_assurance_maladie_active: false,
      assurance_maladie_percentage: 0.065,
      is_vieillesse_active: false,
      vieillesse_percentage: 0.065,
      revenu_annuel: 100000000,
      revenu_mensuel: 8333333,
      plafond: 500000,
      cotisation: 150000,
      montant_trimestriel: 450000,
      no_immatriculation
    });
    console.log('✅ Affiliation volontaire créée. Id:', affiliation.id, '| N° immatriculation:', affiliation.no_immatriculation);

    const phone_number = affiliation.phone_number || '629821308';
    const userAv = await UserAffiliationVolontaire.create({
      affiliationVolontaireId: affiliation.id,
      user_identify: no_immatriculation,
      phone_number,
      password: passwordHashed,
      first_login: true,
      otp_secret: otpSecret
    });
    console.log('✅ Utilisateur AV créé. Id:', userAv.id, '| user_identify:', userAv.user_identify);

    const { created } = await ensureDeclarationsForAffiliation(affiliation.id);
    console.log('✅ Déclarations automatiques (12 mois) :', created, 'ligne(s) créée(s)');

    console.log('');
    console.log('--- Connexion portail AV ---');
    console.log('Identifiant (user_identify / N° immatriculation) :', no_immatriculation);
    if (!PASSWORD) {
      console.log('Mot de passe généré (à sauvegarder)              :', password);
    } else {
      console.log('Mot de passe                                    : (celui fourni en argument)');
    }
    console.log('');
    console.log('is_risque_professionnel_active = true sur l\'affiliation.');
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    if (err.name === 'SequelizeUniqueConstraintError') {
      console.error('   (no_immatriculation ou email/phone déjà existant — réessayer ou fournir des valeurs uniques)');
    }
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
