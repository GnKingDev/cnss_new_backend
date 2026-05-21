/**
 * Script : Créer une réclamation correction_naissance pour un employé.
 *
 * Usage:
 *   node scripts/create-reclamation-correction-naissance.js <employeur_id> <employe_id> "<nouvelle_date_naissance>"
 *
 * Exemples:
 *   node scripts/create-reclamation-correction-naissance.js 5 12 "15/08/1990"
 *   node scripts/create-reclamation-correction-naissance.js 5 12 "1990-08-15"
 *
 * La nouvelle date de naissance est OBLIGATOIRE.
 * Si les IDs sont omis, le script utilise le premier employeur et le premier employé trouvés en DB.
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const ReclamationDemande = require(path.join(dbPath, 'reclamation', 'model'));
const Employeur = require(path.join(dbPath, 'XYemployeurs', 'model'));
const Employe = require(path.join(dbPath, 'employe', 'model'));
const { Op } = require('sequelize');

const ARG_EMPLOYEUR_ID    = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const ARG_EMPLOYE_ID      = process.argv[3] ? parseInt(process.argv[3], 10) : null;
const NOUVELLE_DATE_NAISS = (process.argv[4] || '').trim();

if (!NOUVELLE_DATE_NAISS) {
  console.error('❌ La nouvelle date de naissance est obligatoire.');
  console.error('   Usage: node scripts/create-reclamation-correction-naissance.js <employeur_id> <employe_id> "<nouvelle_date>"');
  console.error('   Exemple: node scripts/create-reclamation-correction-naissance.js 5 12 "15/08/1990"');
  process.exit(1);
}

async function getNextReference(employeurId) {
  const year = new Date().getFullYear();
  const prefix = `REC-${year}-`;
  const last = await ReclamationDemande.findOne({
    where: { reference: { [Op.like]: `${prefix}%` }, employeur_id: employeurId },
    order: [['id', 'DESC']],
    attributes: ['reference']
  });
  const lastNum = last && last.reference
    ? parseInt(last.reference.replace(prefix, ''), 10) || 0
    : 0;
  return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
}

async function main() {
  // 1. Connexion DB
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion DB OK');
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  // 2. Trouver l'employeur
  let employeur;
  if (ARG_EMPLOYEUR_ID) {
    employeur = await Employeur.findByPk(ARG_EMPLOYEUR_ID);
    if (!employeur) {
      console.error(`❌ Employeur avec id=${ARG_EMPLOYEUR_ID} introuvable`);
      await sequelize.close();
      process.exit(1);
    }
  } else {
    employeur = await Employeur.findOne({ order: [['id', 'ASC']] });
    if (!employeur) {
      console.error('❌ Aucun employeur en base');
      await sequelize.close();
      process.exit(1);
    }
    console.log(`ℹ️  Aucun employeur_id fourni — utilisation du premier trouvé (id=${employeur.id})`);
  }
  console.log(`👔 Employeur : ${employeur.raison_sociale} (id=${employeur.id})`);

  // 3. Trouver l'employé (lié à cet employeur si possible)
  let employe;
  if (ARG_EMPLOYE_ID) {
    employe = await Employe.findByPk(ARG_EMPLOYE_ID);
    if (!employe) {
      console.error(`❌ Employé avec id=${ARG_EMPLOYE_ID} introuvable`);
      await sequelize.close();
      process.exit(1);
    }
  } else {
    // Chercher un employé lié à cet employeur
    employe = await Employe.findOne({
      where: { employeurId: employeur.id },
      order: [['id', 'ASC']]
    });
    if (!employe) {
      // Fallback : n'importe quel employé
      employe = await Employe.findOne({ order: [['id', 'ASC']] });
    }
    if (!employe) {
      console.error('❌ Aucun employé trouvé en base');
      await sequelize.close();
      process.exit(1);
    }
    console.log(`ℹ️  Aucun employe_id fourni — utilisation du premier trouvé (id=${employe.id})`);
  }
  console.log(`👤 Employé : ${employe.last_name} ${employe.first_name} | Matricule: ${employe.matricule || 'N/A'} (id=${employe.id})`);
  if (employe.date_of_birth) {
    const d = new Date(employe.date_of_birth);
    const fmt = `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
    console.log(`   Date de naissance actuelle : ${fmt}`);
  }

  // 4. Construire la description (stocke les infos de l'employé concerné)
  function formatDate(d) {
    if (!d) return null;
    const date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  const dateActuelle = formatDate(employe.date_of_birth);
  const description = [
    `Employé : ${employe.last_name} ${employe.first_name}`,
    employe.matricule ? `Matricule : ${employe.matricule}` : null,
    dateActuelle ? `Date de naissance actuelle : ${dateActuelle}` : null,
    `Nouvelle date de naissance à corriger : ${NOUVELLE_DATE_NAISS}`
  ].filter(Boolean).join(' | ');

  // 5. Générer la référence
  const reference = await getNextReference(employeur.id);

  // 6. Créer la réclamation
  const reclamation = await ReclamationDemande.create({
    employeur_id: employeur.id,
    reference,
    type: 'correction_naissance',
    libelle: `Correction date naissance — ${employe.last_name} ${employe.first_name}`,
    status: 'pending',
    progress: 0,
    description
  });

  console.log('');
  console.log('✅ Réclamation créée avec succès !');
  console.log('────────────────────────────────────');
  console.log(`  ID          : ${reclamation.id}`);
  console.log(`  Référence   : ${reclamation.reference}`);
  console.log(`  Type        : ${reclamation.type}`);
  console.log(`  Libellé     : ${reclamation.libelle}`);
  console.log(`  Statut      : ${reclamation.status}`);
  console.log(`  Employeur   : ${employeur.raison_sociale} (id=${employeur.id})`);
  console.log(`  Employé     : ${employe.last_name} ${employe.first_name} (id=${employe.id})`);
  console.log(`  Description : ${description}`);
  console.log('────────────────────────────────────');
  console.log('');

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('❌ Erreur inattendue:', err.message);
  console.error(err.stack);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
