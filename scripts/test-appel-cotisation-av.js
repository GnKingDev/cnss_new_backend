/**
 * Script de test — génère un PDF "Appel à cotisation AV" avec des données exemple.
 * Usage : node scripts/test-appel-cotisation-av.js
 *
 * Le PDF est écrit dans document/docs/ et le chemin est affiché en sortie.
 */

require('dotenv').config();

// Force l'utilisation de Chrome système sur macOS si le Chrome bundlé échoue
process.env.PUPPETEER_EXECUTABLE_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const { generateAppelCotisationAv } = require('../services/appel-cotisation-av.service');

// ── Données exemple ───────────────────────────────────────────────────────────

const affiliation = {
  id: 1,
  no_immatriculation: 'AV-2024-000001',
  nom: 'CAMARA',
  prenom: 'Mamadou',
  adresse: 'Quartier Matam, Conakry',
  profession: 'Commerçant',
  email: 'mamadou.camara@example.com',
  phone_number: '620 00 00 01',

  // Branches cochées (mettre à false pour tester une branche désactivée)
  is_assurance_maladie_active:   true,
  is_risque_professionnel_active: true,
  is_vieillesse_active:           true,

  // Taux (optionnel — valeurs par défaut utilisées si absent)
  assurance_maladie_percentage:   0.065,
  risque_professionnel_percentage: 0.06,
  vieillesse_percentage:           0.065,

  // Revenus
  revenu_annuel:  9_600_000,
  revenu_mensuel:   800_000,
  plafond:          800_000,
  cotisation:       156_000,
};

const declaration = {
  id: 99,
  affiliationVolontaireId: 1,
  year:    2025,
  periode: '05',           // Mai
  montant_cotisation: 156_000,
  revenu_mensuel:     800_000,
  revenu_annuel:    9_600_000,
  is_paid: false,
};

// ── Génération ────────────────────────────────────────────────────────────────

(async () => {
  try {
    console.log('⏳ Génération du PDF en cours...');
    const { pdfPath } = await generateAppelCotisationAv(declaration, affiliation);
    console.log('✅ PDF généré avec succès :');
    console.log('   ', pdfPath);
  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
  }
})();
