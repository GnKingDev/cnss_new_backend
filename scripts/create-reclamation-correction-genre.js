/**
 * Script : Créer une réclamation correction_genre pour un employé + fichier joint.
 *
 * Usage:
 *   node scripts/create-reclamation-correction-genre.js <employeur_id> <employe_id> <genre>
 *
 * Exemples:
 *   node scripts/create-reclamation-correction-genre.js 5 12 F
 *   node scripts/create-reclamation-correction-genre.js 5 12 M
 *
 * genre : M (Masculin) ou F (Féminin)
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const ReclamationDemande = require(path.join(dbPath, 'reclamation', 'model'));
const Employeur = require(path.join(dbPath, 'XYemployeurs', 'model'));
const Employe = require(path.join(dbPath, 'employe', 'model'));
const { Op } = require('sequelize');

const ARG_EMPLOYEUR_ID = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const ARG_EMPLOYE_ID   = process.argv[3] ? parseInt(process.argv[3], 10) : null;
const ARG_GENRE        = (process.argv[4] || '').toUpperCase().trim();

if (!ARG_GENRE || !['M', 'F'].includes(ARG_GENRE)) {
  console.error('❌ Le genre est obligatoire : M (Masculin) ou F (Féminin)');
  console.error('   Usage: node scripts/create-reclamation-correction-genre.js <employeur_id> <employe_id> <genre>');
  console.error('   Exemple: node scripts/create-reclamation-correction-genre.js 5 12 F');
  process.exit(1);
}

const genreLabel = (g) => g === 'M' ? 'Masculin' : g === 'F' ? 'Féminin' : (g || 'Non renseigné');

function formatDate(d) {
  if (!d) return 'Non renseignée';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
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
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion DB OK');
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  // 1. Trouver l'employeur
  let employeur;
  if (ARG_EMPLOYEUR_ID) {
    employeur = await Employeur.findByPk(ARG_EMPLOYEUR_ID);
    if (!employeur) {
      console.error(`❌ Employeur avec id=${ARG_EMPLOYEUR_ID} introuvable`);
      await sequelize.close(); process.exit(1);
    }
  } else {
    employeur = await Employeur.findOne({ order: [['id', 'ASC']] });
    if (!employeur) {
      console.error('❌ Aucun employeur en base');
      await sequelize.close(); process.exit(1);
    }
    console.log(`ℹ️  Aucun employeur_id fourni — utilisation du premier trouvé (id=${employeur.id})`);
  }
  console.log(`👔 Employeur : ${employeur.raison_sociale} (id=${employeur.id})`);

  // 2. Trouver l'employé
  let employe;
  if (ARG_EMPLOYE_ID) {
    employe = await Employe.findByPk(ARG_EMPLOYE_ID);
    if (!employe) {
      console.error(`❌ Employé avec id=${ARG_EMPLOYE_ID} introuvable`);
      await sequelize.close(); process.exit(1);
    }
  } else {
    employe = await Employe.findOne({ where: { employeurId: employeur.id }, order: [['id', 'ASC']] });
    if (!employe) employe = await Employe.findOne({ order: [['id', 'ASC']] });
    if (!employe) {
      console.error('❌ Aucun employé trouvé en base');
      await sequelize.close(); process.exit(1);
    }
    console.log(`ℹ️  Aucun employe_id fourni — utilisation du premier trouvé (id=${employe.id})`);
  }

  const genreActuel = employe.gender || 'N/A';
  console.log(`👤 Employé      : ${employe.last_name} ${employe.first_name} (id=${employe.id})`);
  console.log(`   Matricule    : ${employe.matricule || 'N/A'}`);
  console.log(`   N° Immat     : ${employe.no_immatriculation || 'N/A'}`);
  console.log(`   Date naiss.  : ${formatDate(employe.date_of_birth)}`);
  console.log(`   Genre actuel : ${genreLabel(genreActuel)} (${genreActuel})`);
  console.log(`   Nouveau genre: ${genreLabel(ARG_GENRE)} (${ARG_GENRE})`);

  if (genreActuel === ARG_GENRE) {
    console.warn(`⚠️  L'employé a déjà le genre "${genreLabel(ARG_GENRE)}" — la réclamation sera quand même créée.`);
  }

  // 3. Construire la description lisible + données structurées
  const description = [
    `Employé : ${employe.last_name} ${employe.first_name}`,
    `Matricule : ${employe.matricule || 'N/A'}`,
    `N° immatriculation : ${employe.no_immatriculation || 'N/A'}`,
    `Date de naissance : ${formatDate(employe.date_of_birth)}`,
    `Genre actuel : ${genreLabel(genreActuel)} (${genreActuel})`,
    `Nouveau genre demandé : ${genreLabel(ARG_GENRE)} (${ARG_GENRE})`,
    `__employe_id:${employe.id}`,
    `__genre:${ARG_GENRE}`,
  ].join(' | ');

  // 4. Générer la référence
  const reference = await getNextReference(employeur.id);

  // 5. Créer le fichier document joint
  const uploadDir = path.join(__dirname, '..', 'uploads', 'reclamations');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const filename = `rec-genre-${Date.now()}-${employe.id}.txt`;
  const filePath = path.join(uploadDir, filename);

  const contenu = [
    '=============================================================',
    '         DEMANDE DE CORRECTION DE GENRE',
    '=============================================================',
    '',
    `Référence réclamation  : ${reference}`,
    `Date de la demande     : ${new Date().toLocaleDateString('fr-FR')}`,
    '',
    '--- EMPLOYÉ CONCERNÉ ---',
    `Nom et prénom          : ${employe.last_name} ${employe.first_name}`,
    `Matricule              : ${employe.matricule || 'N/A'}`,
    `N° immatriculation     : ${employe.no_immatriculation || 'N/A'}`,
    `Date de naissance      : ${formatDate(employe.date_of_birth)}`,
    `Lieu de naissance      : ${employe.place_of_birth || 'N/A'}`,
    `Nationalité            : ${employe.nationality || 'N/A'}`,
    '',
    '--- CORRECTION DEMANDÉE ---',
    `Genre actuel (incorrect)   : ${genreLabel(genreActuel)} (${genreActuel})`,
    `Nouveau genre (correct)    : ${genreLabel(ARG_GENRE)} (${ARG_GENRE})`,
    '',
    '--- EMPLOYEUR ---',
    `Raison sociale         : ${employeur.raison_sociale}`,
    `N° immatriculation     : ${employeur.no_immatriculation || 'N/A'}`,
    '',
    '=============================================================',
    'Document généré automatiquement — à remplacer par l\'extrait',
    'de naissance officiel ou tout document justificatif.',
    '=============================================================',
  ].join('\n');

  fs.writeFileSync(filePath, contenu, 'utf8');
  console.log(`📄 Fichier créé : ${filename}`);

  // 6. Créer la réclamation avec document_path
  const reclamation = await ReclamationDemande.create({
    employeur_id: employeur.id,
    reference,
    type: 'correction_genre',
    libelle: `Correction de genre — ${employe.last_name} ${employe.first_name} : ${genreLabel(genreActuel)} → ${genreLabel(ARG_GENRE)}`,
    status: 'pending',
    progress: 0,
    description,
    document_path: `uploads/reclamations/${filename}`,
  });

  console.log('');
  console.log('✅ Réclamation créée avec succès !');
  console.log('────────────────────────────────────────────────────');
  console.log(`  ID          : ${reclamation.id}`);
  console.log(`  Référence   : ${reclamation.reference}`);
  console.log(`  Type        : ${reclamation.type}`);
  console.log(`  Libellé     : ${reclamation.libelle}`);
  console.log(`  Statut      : ${reclamation.status}`);
  console.log(`  Document    : uploads/reclamations/${filename}`);
  console.log(`  URL BO      : /uploads/reclamations/${filename}`);
  console.log('────────────────────────────────────────────────────');

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('❌ Erreur inattendue:', err.message);
  console.error(err.stack);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
