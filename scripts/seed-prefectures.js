/**
 * Script : insérer les préfectures dans la table prefecture.
 * Usage: node scripts/seed-prefectures.js
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const Prefecture = require(path.join(dbPath, 'prefecture', 'model'));

const PREFECTURES = [
  { id: 42, name: 'BOFFA', code: '02', paysId: 75 },
  { id: 43, name: 'BEYLA', code: '01', paysId: 75 },
  { id: 44, name: 'CONAKRY', code: '04', paysId: 75 },
  { id: 45, name: 'BOKE', code: '03', paysId: 75 },
  { id: 46, name: 'COYAH', code: '05', paysId: 75 },
  { id: 47, name: 'DABOLA', code: '06', paysId: 75 },
  { id: 48, name: 'DINGUIRAYE', code: '08', paysId: 75 },
  { id: 49, name: 'DALABA', code: '07', paysId: 75 },
  { id: 50, name: 'DUBRÉKA', code: '09', paysId: 75 },
  { id: 51, name: 'FARANAH', code: '10', paysId: 75 },
  { id: 52, name: 'FORÉCARIAH', code: '11', paysId: 75 },
  { id: 53, name: 'FRIA', code: '12', paysId: 75 },
  { id: 54, name: 'GUÉCKÉDOU', code: '14', paysId: 75 },
  { id: 55, name: 'GAOUAL', code: '13', paysId: 75 },
  { id: 56, name: 'KANKAN', code: '15', paysId: 75 },
  { id: 57, name: 'KÉROUANÉ', code: '16', paysId: 75 },
  { id: 58, name: 'KISSIDOUGOU', code: '18', paysId: 75 },
  { id: 59, name: 'KINDIA', code: '17', paysId: 75 },
  { id: 60, name: 'KOUNDARA', code: '20', paysId: 75 },
  { id: 61, name: 'KOUROUSSA', code: '21', paysId: 75 },
  { id: 62, name: 'LÉLOUMA', code: '23', paysId: 75 },
  { id: 63, name: 'LABÉ', code: '22', paysId: 75 },
  { id: 64, name: 'LOLA', code: '24', paysId: 75 },
  { id: 65, name: 'MACENTA', code: '25', paysId: 75 },
  { id: 66, name: 'MAMOU', code: '27', paysId: 75 },
  { id: 67, name: 'MALI', code: '26', paysId: 75 },
  { id: 68, name: 'MANDIANA', code: '28', paysId: 75 },
  { id: 69, name: "N' ZÉRÉKORÉ", code: '29', paysId: 75 },
  { id: 70, name: 'PITA', code: '30', paysId: 75 },
  { id: 71, name: 'SIGUIRI', code: '31', paysId: 75 },
  { id: 72, name: 'TÉLÉMELÉ', code: '32', paysId: 75 },
  { id: 73, name: 'TOUGUÉ', code: '33', paysId: 75 },
  { id: 74, name: 'MATAM', code: '39', paysId: 75 },
  { id: 75, name: 'YOMOU', code: '34', paysId: 75 },
  { id: 76, name: 'ETRANGER', code: '99', paysId: 75 },
  { id: 77, name: 'RATOMA', code: '40', paysId: 75 },
  { id: 78, name: 'KOUBIA', code: '19', paysId: 75 },
  { id: 79, name: 'MATOTO', code: '41', paysId: 75 },
  { id: 81, name: 'KALOUM', code: '37', paysId: 75 },
  { id: 82, name: 'DIXINN', code: '38', paysId: 75 }
];

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  console.log('--- Insertion des préfectures (table prefecture) ---\n');

  try {
    const count = await Prefecture.count();
    if (count > 0) {
      console.log('La table prefecture contient déjà', count, 'ligne(s).');
      console.log('Mise à jour des enregistrements existants et insertion des manquants...\n');
    }

    for (const p of PREFECTURES) {
      await Prefecture.upsert({
        id: p.id,
        name: p.name,
        code: p.code,
        paysId: p.paysId
      });
    }

    const total = await Prefecture.count();
    console.log('✅', PREFECTURES.length, 'préfecture(s) traitées. Total en base :', total);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
