/**
 * Script : Créer un fichier txt et l'attacher comme document_path à une réclamation.
 *
 * Usage:
 *   node scripts/attach-document-reclamation.js <reclamation_id>
 *
 * Exemple:
 *   node scripts/attach-document-reclamation.js 4
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const ReclamationDemande = require(path.join(dbPath, 'reclamation', 'model'));

const RECLAMATION_ID = process.argv[2] ? parseInt(process.argv[2], 10) : null;

if (!RECLAMATION_ID || isNaN(RECLAMATION_ID)) {
  console.error('❌ ID de réclamation obligatoire.');
  console.error('   Usage: node scripts/attach-document-reclamation.js <reclamation_id>');
  process.exit(1);
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

  // 2. Trouver la réclamation
  const reclamation = await ReclamationDemande.findByPk(RECLAMATION_ID);
  if (!reclamation) {
    console.error(`❌ Réclamation #${RECLAMATION_ID} introuvable`);
    await sequelize.close();
    process.exit(1);
  }

  console.log(`📋 Réclamation trouvée : ${reclamation.reference} | Type: ${reclamation.type} | Statut: ${reclamation.status}`);
  if (reclamation.description) {
    console.log(`   Description : ${reclamation.description}`);
  }

  // 3. Créer le dossier uploads/reclamations si absent
  const uploadDir = path.join(__dirname, '..', 'uploads', 'reclamations');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`📁 Dossier créé : ${uploadDir}`);
  }

  // 4. Créer le fichier txt
  const filename = `rec-${RECLAMATION_ID}-extrait-naissance-${Date.now()}.txt`;
  const filePath = path.join(uploadDir, filename);

  const description = reclamation.description || '';

  // Extraire les infos de la description
  const nomMatch = description.match(/Employé\s*:\s*([^|]+)/);
  const matriculeMatch = description.match(/Matricule\s*:\s*([^|]+)/);
  const dateActuelleMatch = description.match(/Date de naissance actuelle\s*:\s*([^|]+)/);
  const nouvelleDateMatch = description.match(/Nouvelle date de naissance à corriger\s*:\s*([^|]+)/);

  const nom = nomMatch ? nomMatch[1].trim() : 'Inconnu';
  const matricule = matriculeMatch ? matriculeMatch[1].trim() : 'N/A';
  const dateActuelle = dateActuelleMatch ? dateActuelleMatch[1].trim() : 'Non renseignée';
  const nouvelleDate = nouvelleDateMatch ? nouvelleDateMatch[1].trim() : 'Non renseignée';

  const contenu = [
    '=============================================================',
    '         DEMANDE DE CORRECTION DE DATE DE NAISSANCE',
    '=============================================================',
    '',
    `Référence réclamation : ${reclamation.reference}`,
    `Date de la demande    : ${reclamation.createdAt ? new Date(reclamation.createdAt).toLocaleDateString('fr-FR') : 'N/A'}`,
    '',
    '--- EMPLOYÉ CONCERNÉ ---',
    `Nom et prénom         : ${nom}`,
    `Matricule             : ${matricule}`,
    '',
    '--- CORRECTION DEMANDÉE ---',
    `Date de naissance actuelle (incorrecte) : ${dateActuelle}`,
    `Nouvelle date de naissance (correcte)   : ${nouvelleDate}`,
    '',
    '--- STATUT ---',
    `Statut de la demande  : ${reclamation.status}`,
    '',
    '=============================================================',
    'Document généré automatiquement — à remplacer par l\'extrait',
    'de naissance officiel scanné de l\'employé concerné.',
    '=============================================================',
  ].join('\n');

  fs.writeFileSync(filePath, contenu, 'utf8');
  console.log(`📄 Fichier créé : ${filePath}`);

  // 5. Mettre à jour document_path dans la DB
  const relativePath = `uploads/reclamations/${filename}`;
  await reclamation.update({ document_path: relativePath });

  console.log('');
  console.log('✅ Document attaché avec succès !');
  console.log('────────────────────────────────────────────────────');
  console.log(`  Réclamation ID : ${reclamation.id}`);
  console.log(`  Référence      : ${reclamation.reference}`);
  console.log(`  Fichier        : ${filename}`);
  console.log(`  document_path  : ${relativePath}`);
  console.log(`  URL dans le BO : /uploads/reclamations/${filename}`);
  console.log('────────────────────────────────────────────────────');
  console.log('');
  console.log('👉 Le bouton "Télécharger" doit maintenant apparaître dans le détail BO.');

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('❌ Erreur inattendue:', err.message);
  console.error(err.stack);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
