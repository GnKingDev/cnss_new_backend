/**
 * Script : mettre à jour une affiliation volontaire (prefectureId, brancheId).
 * Utilise les modèles Prefecture et Branche (tables prefecture et branches).
 *
 * Usage: node scripts/update-av-affiliation.js [no_immatriculation]
 * Exemple: node scripts/update-av-affiliation.js
 * Exemple: node scripts/update-av-affiliation.js AV-20260305-3302
 *
 * Par défaut no_immatriculation = AV-20260305-3302.
 * prefectureId : id 44 (CONAKRY) si présent, sinon le premier. brancheId : id 2 si présent, sinon le premier.
 */
require('dotenv').config();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));
const AffiliationVolontaire = require(path.join(dbPath, 'affiliation-volontaire', 'model'));
const Prefecture = require(path.join(dbPath, 'prefecture', 'model'));
const Branche = require(path.join(dbPath, 'branches', 'model'));

const NO_IMMATRICULATION = process.argv[2] || 'AV-20260305-3302';
const PREFECTURE_ID_PREFER = 44;
const BRANCHE_ID_PREFER = 2;

async function main() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  console.log('--- Mise à jour affiliation volontaire ---\n');

  try {
    const prefectures = await Prefecture.findAll({
      order: [['id', 'ASC']],
      attributes: ['id', 'name', 'code']
    });
    const branches = await Branche.findAll({
      order: [['id', 'ASC']],
      attributes: ['id', 'name', 'code']
    });

    console.log('Préfectures (table prefecture) :', prefectures.length, 'ligne(s)');
    if (prefectures.length === 0) {
      console.log('  (aucune)');
    } else {
      prefectures.forEach((p) => {
        const row = p.get ? p.get({ plain: true }) : p;
        console.log('  id:', row.id, '| name:', row.name, '| code:', row.code ?? '—');
      });
    }
    console.log('');
    console.log('Branches (table branches) :', branches.length, 'ligne(s)');
    if (branches.length === 0) {
      console.log('  (aucune)');
    } else {
      branches.forEach((b) => {
        const row = b.get ? b.get({ plain: true }) : b;
        console.log('  id:', row.id, '| name:', row.name, '| code:', row.code ?? '—');
      });
    }
    console.log('');

    const prefectureId = prefectures.find((p) => p.id === PREFECTURE_ID_PREFER)?.id ?? prefectures[0]?.id ?? null;
    const brancheId = branches.find((b) => b.id === BRANCHE_ID_PREFER)?.id ?? branches[0]?.id ?? null;

    console.log('N° immatriculation ciblé :', NO_IMMATRICULATION);
    console.log('prefectureId retenu :', prefectureId ?? '(aucune)');
    console.log('brancheId retenu    :', brancheId ?? '(aucune)');
    if (prefectureId === null && brancheId === null) {
      console.error('\n❌ Aucune préfecture ni branche. Exécutez d\'abord node scripts/seed-prefectures.js');
      process.exit(1);
    }
    console.log('');

    let affiliation = await AffiliationVolontaire.findOne({
      where: { no_immatriculation: NO_IMMATRICULATION }
    });
    if (!affiliation) {
      affiliation = await AffiliationVolontaire.findOne({
        where: { email: 'av-av202603053302@example.gn' }
      });
      if (affiliation) {
        await affiliation.update({
          no_immatriculation: NO_IMMATRICULATION,
          ...(prefectureId != null && { prefectureId }),
          ...(brancheId != null && { brancheId })
        });
        console.log('✅ Affiliation mise à jour (trouvée par email). Id:', affiliation.id);
      } else {
        console.error('❌ Aucune affiliation trouvée pour no_immatriculation =', NO_IMMATRICULATION, 'ni pour email av-av202603053302@example.gn');
        process.exit(1);
      }
    } else {
      await affiliation.update({
        ...(prefectureId != null && { prefectureId }),
        ...(brancheId != null && { brancheId })
      });
      console.log('✅ Affiliation mise à jour. Id:', affiliation.id);
    }
    console.log('   prefectureId:', prefectureId, '| brancheId:', brancheId);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
