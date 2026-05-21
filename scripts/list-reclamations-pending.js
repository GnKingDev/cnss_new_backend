/**
 * Script : Lister toutes les réclamations non traitées (pending + processing).
 *
 * Usage:
 *   node scripts/list-reclamations-pending.js
 *   node scripts/list-reclamations-pending.js pending       ← uniquement en attente
 *   node scripts/list-reclamations-pending.js processing    ← uniquement en traitement
 *   node scripts/list-reclamations-pending.js all           ← toutes (y compris approved/rejected)
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const ReclamationDemande = require(path.join(dbPath, 'reclamation', 'model'));
const Employeur = require(path.join(dbPath, 'XYemployeurs', 'model'));
const { Op } = require('sequelize');

const ARG = (process.argv[2] || '').toLowerCase();

const STATUS_LABELS = {
  pending:    '🟡 En attente',
  processing: '🔵 En traitement',
  approved:   '🟢 Approuvée',
  rejected:   '🔴 Rejetée',
};

const TYPE_LABELS = {
  quittance:               'Quittance',
  notification:            'Notification',
  facture:                 'Facture',
  certificat:              'Certificat',
  annulation:              'Annulation',
  rectification:           'Rectification',
  correction_naissance:    'Correction naissance',
  correction_genre:        'Correction genre',
  changement_raison_sociale: 'Changement raison sociale',
  autre:                   'Autre',
};

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  // Construire le filtre statut
  let where = {};
  if (ARG === 'pending') {
    where.status = 'pending';
  } else if (ARG === 'processing') {
    where.status = 'processing';
  } else if (ARG === 'all') {
    where = {}; // tout
  } else {
    // Par défaut : pending + processing
    where.status = { [Op.in]: ['pending', 'processing'] };
  }

  const rows = await ReclamationDemande.findAll({
    where,
    include: [{ model: Employeur, as: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation'] }],
    order: [['createdAt', 'ASC']],
  });

  if (rows.length === 0) {
    console.log('✅ Aucune réclamation non traitée.');
    await sequelize.close();
    return;
  }

  // Grouper par statut
  const grouped = {};
  rows.forEach((r) => {
    if (!grouped[r.status]) grouped[r.status] = [];
    grouped[r.status].push(r);
  });

  const total = rows.length;
  console.log('');
  console.log(`══════════════════════════════════════════════════════════`);
  console.log(`  RÉCLAMATIONS NON TRAITÉES — ${total} au total`);
  console.log(`══════════════════════════════════════════════════════════`);

  for (const [status, items] of Object.entries(grouped)) {
    console.log('');
    console.log(`  ${STATUS_LABELS[status] || status.toUpperCase()} (${items.length})`);
    console.log(`  ${'─'.repeat(54)}`);

    items.forEach((r) => {
      const date = r.createdAt
        ? new Date(r.createdAt).toLocaleDateString('fr-FR')
        : 'N/A';
      const employeur = r.employeur
        ? `${r.employeur.raison_sociale} (${r.employeur.no_immatriculation || 'N/A'})`
        : `Employeur #${r.employeur_id}`;
      const type = TYPE_LABELS[r.type] || r.type;
      const doc = r.document_path ? '📎 doc joint' : '─ sans doc';

      console.log(`  ID: ${String(r.id).padEnd(5)} | ${r.reference || 'N/A'}`);
      console.log(`          Type      : ${type}`);
      console.log(`          Employeur : ${employeur}`);
      console.log(`          Date      : ${date}`);
      console.log(`          Document  : ${doc}`);
      if (r.description) {
        // Tronquer si trop long
        const desc = r.description.length > 80 ? r.description.substring(0, 80) + '...' : r.description;
        console.log(`          Détail    : ${desc}`);
      }
      console.log('');
    });
  }

  console.log(`══════════════════════════════════════════════════════════`);
  console.log('');

  await sequelize.close();
}

main().catch(async (err) => {
  console.error('❌ Erreur inattendue:', err.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
