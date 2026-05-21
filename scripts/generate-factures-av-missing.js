/**
 * Génère le PDF "Appel à cotisation" pour toutes les déclarations AV qui n'en ont pas encore.
 * Critère : facture_path IS NULL ou le fichier n'existe plus sur disque.
 *
 * Usage : node scripts/generate-factures-av-missing.js
 *
 * Options (variables d'environnement) :
 *   DRY_RUN=1   → liste les déclarations concernées sans rien générer
 *   AV_ID=42    → traite uniquement l'affiliation avec cet id
 */
require('dotenv').config();

const path = require('path');
const fs   = require('fs');

const dbPath    = path.join(__dirname, '..', 'db');
const sequelize = require(path.join(dbPath, 'db.connection'));

const AffiliationVolontaire            = require(path.join(dbPath, 'affiliation-volontaire', 'model'));
const DeclarationAffiliationVolontaire = require(path.join(dbPath, 'declaration_affiliation_volontaire', 'model'));
const { generateAppelCotisationAv }    = require(path.join(__dirname, '..', 'services', 'appel-cotisation-av.service'));

const ROOT_DIR = path.join(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'document', 'docs');
if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

const DRY_RUN = process.env.DRY_RUN === '1';
const AV_ID   = process.env.AV_ID ? parseInt(process.env.AV_ID, 10) : null;

// ── Utilitaire ────────────────────────────────────────────────────────────────

function needsFacture(decl) {
  if (!decl.facture_path) return true;
  return !fs.existsSync(decl.facture_path);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion DB OK\n');
  } catch (err) {
    console.error('❌ Connexion DB impossible:', err.message);
    process.exit(1);
  }

  try {
    // 1. Charger les affiliations concernées
    const affWhere = AV_ID ? { id: AV_ID } : {};
    const affiliations = await AffiliationVolontaire.findAll({
      where: affWhere,
      order: [['id', 'ASC']],
    });

    if (affiliations.length === 0) {
      console.log('Aucune affiliation trouvée.');
      return;
    }
    console.log(`Affiliations à parcourir : ${affiliations.length}`);
    if (DRY_RUN) console.log('⚠️  Mode DRY_RUN — aucun fichier ne sera généré\n');

    let totalOk    = 0;
    let totalSkip  = 0;
    let totalError = 0;

    for (const aff of affiliations) {
      const avRaw = aff.get ? aff.get({ plain: true }) : aff;

      // 2. Charger les déclarations de cet affilié (toutes, sans filtre de date)
      const declarations = await DeclarationAffiliationVolontaire.findAll({
        where: { affiliationVolontaireId: avRaw.id },
        order: [['year', 'ASC'], ['periode', 'ASC']],
      });

      const toGenerate = declarations.filter((d) => {
        const row = d.get ? d.get({ plain: true }) : d;
        return needsFacture(row);
      });

      if (toGenerate.length === 0) {
        totalSkip += declarations.length;
        continue;
      }

      console.log(
        `\n[AV #${avRaw.id}] ${avRaw.no_immatriculation ?? '—'} — ${avRaw.nom ?? ''} ${avRaw.prenom ?? ''}` +
        ` | ${declarations.length} décl., ${toGenerate.length} sans facture`
      );

      for (const decl of toGenerate) {
        const declRaw = decl.get ? decl.get({ plain: true }) : decl;
        const label   = `  Décl #${declRaw.id} ${declRaw.periode}/${declRaw.year}`;

        if (DRY_RUN) {
          console.log(`${label} → manquante (dry-run, ignorée)`);
          continue;
        }

        try {
          const buffer   = await generateAppelCotisationAv(declRaw, avRaw);
          const fileName = `appel-cotisation-av-${avRaw.no_immatriculation || avRaw.id}-${declRaw.periode}-${declRaw.year}.pdf`;
          const pdfPath  = path.join(DOCS_DIR, fileName);
          fs.writeFileSync(pdfPath, buffer);
          await decl.update({ facture_path: pdfPath });
          console.log(`${label} → ✅ ${fileName}`);
          totalOk++;
        } catch (err) {
          console.error(`${label} → ❌ ${err.message}`);
          totalError++;
        }
      }
    }

    console.log('\n─────────────────────────────────────────');
    if (DRY_RUN) {
      console.log('Dry-run terminé. Aucune modification effectuée.');
    } else {
      console.log(`✅ Générés    : ${totalOk}`);
      console.log(`⏭️  Déjà OK   : ${totalSkip}`);
      console.log(`❌ Erreurs   : ${totalError}`);
    }
  } catch (err) {
    console.error('❌ Erreur fatale:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
