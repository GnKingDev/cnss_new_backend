/**
 * Migration : convertit les déclarations mensuelles → trimestrielles pour un affilié AV.
 * Usage : node scripts/migrate-declarations-av-to-quarterly.js --imma AV-20260305-3302
 */
require('dotenv').config();
const path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'db', 'relations'));

const AffiliationVolontaire           = require(path.join(root, 'db', 'affiliation-volontaire', 'model'));
const DeclarationAffiliationVolontaire = require(path.join(root, 'db', 'declaration_affiliation_volontaire', 'model'));
const QuittanceAV                     = require(path.join(root, 'db', 'quittance_affiliation_volontaire', 'model'));
const { computeSimulationFromAffiliation } = require(path.join(root, 'db', 'affiliation-volontaire', 'utility'));

const QUARTERS = [
  { q: 1, label: 'Jan-Fév-Mar', startMonth: 1, endMonth: 3  },
  { q: 2, label: 'Avr-Mai-Jun', startMonth: 4, endMonth: 6  },
  { q: 3, label: 'Jul-Aoû-Sep', startMonth: 7, endMonth: 9  },
  { q: 4, label: 'Oct-Nov-Déc', startMonth: 10, endMonth: 12 },
];

function qIndexForMonth(month) { return Math.floor((month - 1) / 3); }

function computeProrata(validatedDate, qDef, year, cotisationTrim) {
  const start = new Date(validatedDate);
  start.setHours(0, 0, 0, 0);
  const endPlusOne = new Date(year, qDef.endMonth, 1);
  const days = Math.min(Math.max(Math.round((endPlusOne - start) / 86400000), 1), 90);
  return Math.round(cotisationTrim * days / 90);
}

async function migrate(imma) {
  // 1. Charger l'affiliation
  const aff = await AffiliationVolontaire.findOne({ where: { no_immatriculation: imma } });
  if (!aff) throw new Error(`Affiliation ${imma} introuvable`);
  const affRaw = aff.get({ plain: true });

  console.log(`\n── Affilié : ${affRaw.nom} ${affRaw.prenom} (id=${affRaw.id})`);
  console.log(`   validated_date : ${affRaw.validated_date}`);
  console.log(`   revenu_annuel  : ${Number(affRaw.revenu_annuel).toLocaleString('fr-FR')} GNF`);

  // 2. Calcul simulation
  const sim = computeSimulationFromAffiliation(affRaw);
  console.log(`   plafond mensuel : ${sim.plafond.toLocaleString('fr-FR')} GNF`);
  console.log(`   cotisation mens : ${sim.cotisation.toLocaleString('fr-FR')} GNF`);
  console.log(`   cotisation trim : ${sim.montant_trimestriel.toLocaleString('fr-FR')} GNF`);

  // 3. Déclarations existantes
  const existing = await DeclarationAffiliationVolontaire.findAll({
    where: { affiliationVolontaireId: affRaw.id },
    order: [['year', 'ASC'], ['periode', 'ASC']]
  });
  console.log(`\n   ${existing.length} déclaration(s) mensuelle(s) trouvée(s) :`);
  existing.forEach(d => {
    const r = d.get({ plain: true });
    console.log(`     → ${r.periode}/${r.year}  montant=${Number(r.montant_cotisation).toLocaleString('fr-FR')}  payé=${r.is_paid}`);
  });

  // 4. Déterminer les trimestres à créer depuis validated_date
  const refDate  = new Date(affRaw.validated_date || affRaw.createdAt);
  const now      = new Date();
  let y    = refDate.getFullYear();
  let qIdx = qIndexForMonth(refDate.getMonth() + 1);
  const curYear = now.getFullYear();
  const curQIdx = qIndexForMonth(now.getMonth() + 1);

  const quarters = [];
  let first = true;
  while (y < curYear || (y === curYear && qIdx <= curQIdx)) {
    const qDef   = QUARTERS[qIdx];
    const montant = first
      ? computeProrata(refDate, qDef, y, sim.montant_trimestriel)
      : sim.montant_trimestriel;
    quarters.push({ year: y, periode: qDef.label, qDef, montant, isFirst: first });
    first = false;
    qIdx++;
    if (qIdx >= 4) { qIdx = 0; y++; }
  }

  // 5. Déterminer les trimestres payés (si toutes les déclars mensuelles du trimestre étaient payées)
  const paidMonths = new Set(
    existing
      .filter(d => d.is_paid)
      .map(d => `${d.year}-${String(d.periode).padStart(2, '0')}`)
  );

  function quarterIsPaid(qDef, year) {
    for (let m = qDef.startMonth; m <= qDef.endMonth; m++) {
      if (paidMonths.has(`${year}-${String(m).padStart(2, '0')}`)) return true;
    }
    return false;
  }

  console.log(`\n   Trimestres à créer :`);
  quarters.forEach(q => {
    const paid = quarterIsPaid(q.qDef, q.year);
    console.log(`     → ${q.periode} ${q.year}  montant=${q.montant.toLocaleString('fr-FR')} GNF  prorata=${q.isFirst}  payé=${paid}`);
  });

  // 6. Créer les nouvelles déclarations trimestrielles en premier
  console.log('');
  const newDecls = {};
  for (const q of quarters) {
    const isPaid = quarterIsPaid(q.qDef, q.year);
    const created = await DeclarationAffiliationVolontaire.create({
      affiliationVolontaireId: affRaw.id,
      year:               q.year,
      periode:            q.periode,
      montant_cotisation: q.montant,
      revenu_mensuel:     sim.plafond,
      revenu_annuel:      sim.revenu_annuel,
      is_paid:            isPaid,
    });
    newDecls[q.periode] = created.id;
    console.log(`   ✓ Créé : ${q.periode} ${q.year}  montant=${q.montant.toLocaleString('fr-FR')} GNF  payé=${isPaid}  id=${created.id}`);
  }

  // 7. Rattacher les quittances aux nouvelles déclarations trimestrielles
  const quittances = await QuittanceAV.findAll({ where: { affiliationVolontaireId: affRaw.id } });
  for (const q of quittances) {
    const qRaw = q.get({ plain: true });
    const mois = parseInt(qRaw.periode, 10);
    if (!isNaN(mois)) {
      const newPeriode  = QUARTERS[qIndexForMonth(mois)].label;
      const newDeclId   = newDecls[newPeriode];
      await q.update({ periode: newPeriode, declarationId: newDeclId });
      console.log(`   ✓ Quittance id=${qRaw.id} : periode ${qRaw.periode} → ${newPeriode}  declarationId → ${newDeclId}`);
    }
  }

  // 8. Supprimer les anciennes déclarations mensuelles (quittances déjà rerattachées)
  const oldIds = existing.map(d => d.id);
  const deletedCount = await DeclarationAffiliationVolontaire.destroy({
    where: { id: oldIds }
  });
  console.log(`\n   ✓ ${deletedCount} déclaration(s) mensuelle(s) supprimée(s)`);

  console.log('\n── Migration terminée ✓\n');
}

const immaArg = process.argv.find(a => a.startsWith('--imma'));
const imma    = immaArg ? immaArg.split('=')[1] || process.argv[process.argv.indexOf(immaArg) + 1] : 'AV-20260305-3302';

migrate(imma)
  .then(() => process.exit(0))
  .catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
