/**
 * Service de génération du PDF "Appel à cotisation — Affilié Volontaire".
 * Même structure HTML/PDF que getFileAppelCotisation (utility.js) mais adapté aux AV :
 *  - identité affilié (nom, immatriculation, adresse, email, téléphone)
 *  - tableau uniquement des branches cochées (is_assurance_maladie_active, etc.)
 *  - revenus déclarés + plafond soumis à cotisation
 *
 * Le PDF est écrit sur disque (document/docs/) et le chemin est retourné.
 */

const path      = require('path');
const fs        = require('fs');
const puppeteer = require('puppeteer');
const QRCode    = require('qrcode');

const ROOT_DIR = path.resolve(__dirname, '..');

const PLAFOND_MIN = 550000;
const PLAFOND_MAX = 2500000;

/** Même logique que affiliation-volontaire/utility.js → getPlafondMensuel */
function getPlafondMensuel(revenu_annuel) {
  const mensuel = Math.round(Number(revenu_annuel) / 12);
  return Math.max(PLAFOND_MIN, Math.min(mensuel, PLAFOND_MAX));
}

const IMAGE_PATHS = {
  logo:     path.join(ROOT_DIR, 'CNSS.jpg'),
  simandou: path.join(ROOT_DIR, 'simandou.jpeg'),
};

const PUPPETEER_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--disable-gpu', '--disable-software-rasterizer', '--no-first-run',
  '--disable-extensions', '--disable-background-networking',
];

// Date limite de paiement : 20 du mois suivant la fin du trimestre
const QUARTER_DATE_LIMITE = {
  'Jan-Fév-Mar': (year) => `20/04/${year}`,
  'Avr-Mai-Jun': (year) => `20/07/${year}`,
  'Jul-Aoû-Sep': (year) => `20/10/${year}`,
  'Oct-Nov-Déc': (year) => `20/01/${Number(year) + 1}`,
};

function readImageBase64(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath).toString('base64');
  } catch (_) {}
  return '';
}

function resolveChromeExecutable() {
  const chromeDir = path.join(ROOT_DIR, '..', 'chrome');
  if (!fs.existsSync(chromeDir)) return null;
  try {
    const dirs = fs.readdirSync(chromeDir);
    const macDir = dirs.find((d) => d.startsWith('mac_arm-') || d.startsWith('mac-'));
    if (macDir) {
      const p = path.join(chromeDir, macDir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      if (fs.existsSync(p)) return p;
    }
    const linuxDir = dirs.find((d) => d.startsWith('linux-'));
    if (linuxDir) {
      const p = path.join(chromeDir, linuxDir, 'chrome-linux64', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch (_) {}
  return null;
}

/** Formate un nombre en GNF lisible */
function fmt(n) {
  return n != null && !isNaN(n) ? Number(n).toLocaleString('fr-FR') : '0';
}

/**
 * Construit les lignes du tableau des branches actives.
 * @param {object} av      - instance plain AffiliationVolontaire
 * @param {number} plafond - revenu mensuel soumis à cotisation (plafond borné)
 * @param {number} nbMois  - nombre de mois du trimestre (3 par défaut)
 * @returns {{ rows: string }}
 */
function buildBranchesTable(av, plafond, nbMois = 3) {
  const BRANCHES = [
    {
      key:   'is_assurance_maladie_active',
      label: 'Assurance Maladie',
      rate:  Number(av.assurance_maladie_percentage  || 0.065),
    },
    {
      key:   'is_risque_professionnel_active',
      label: 'Risques Professionnels',
      rate:  Number(av.risque_professionnel_percentage || 0.06),
    },
    {
      key:   'is_vieillesse_active',
      label: 'Vieillesse — Décès — Invalidité',
      rate:  Number(av.vieillesse_percentage || 0.065),
    },
  ];

  let rows = '';
  for (const b of BRANCHES) {
    if (!av[b.key]) continue;
    const montant = Math.round(plafond * b.rate * nbMois);
    rows += `
      <tr>
        <td style="padding:6px 8px">${b.label}</td>
        <td style="text-align:center;padding:6px 8px">${(b.rate * 100).toFixed(1)}%</td>
        <td style="text-align:right;padding:6px 8px">${fmt(plafond)}</td>
        <td style="text-align:right;padding:6px 8px;font-weight:600">${fmt(montant)}</td>
      </tr>`;
  }

  if (!rows) {
    rows = `<tr><td colspan="4" style="text-align:center;padding:8px;color:#888">Aucune branche sélectionnée</td></tr>`;
  }

  return { rows };
}

/**
 * Génère le PDF "Appel à cotisation AV" en mémoire et retourne le buffer — rien n'est écrit sur disque.
 *
 * @param {object} declaration - instance plain DeclarationAffiliationVolontaire
 * @param {object} affiliation - instance plain AffiliationVolontaire
 * @returns {Promise<Buffer>}
 */
async function generateAppelCotisationAv(declaration, affiliation) {
  const logo     = readImageBase64(IMAGE_PATHS.logo);
  const simandou = readImageBase64(IMAGE_PATHS.simandou);

  let codeQR = '';
  try {
    codeQR = await QRCode.toDataURL('https://e.cnss.gov.gn/#/', {
      width: 100,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (_) {}

  const av   = affiliation || {};
  const decl = declaration || {};

  const periodeLabel = decl.periode ?? '';
  const annee        = decl.year ?? '';
  const revenuAnnuel = Number(decl.revenu_annuel || av.revenu_annuel || 0);
  const plafond      = getPlafondMensuel(revenuAnnuel);
  const montantDu    = Number(decl.montant_cotisation || 0);

  const { rows: brancheRows } = buildBranchesTable(av, plafond);

  // Date limite = 20 du mois suivant la fin du trimestre
  const dateLimiteFn = QUARTER_DATE_LIMITE[periodeLabel];
  const dateLimite   = dateLimiteFn ? dateLimiteFn(annee) : `—`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Appel à cotisation AV</title>
  <style>
    @page { margin: 0 }
    body { margin: 2cm; font-family: Arial, sans-serif; font-size: 13px; }
    header { position: fixed; top: 0; left: 0; right: 0; height: 4cm; }
    main   { position: relative; top: 80px; }
    footer { position: fixed; bottom: 0; left: 0; right: 0; height: 2cm; }
    table  { border-collapse: collapse; }
    th, td { border: 1px solid #000; vertical-align: middle; }
  </style>
</head>
<body>

<!-- ── En-tête ── -->
<header>
  <div style="display:flex">
    <div style="width:35%">
      <img src="data:image/jpeg;base64,${logo}" width="200" height="100" alt="CNSS"/>
    </div>
    <div style="width:40%;margin-top:15px;text-align:center">
      <span style="font-size:18px;font-weight:bold">RÉPUBLIQUE DE GUINÉE</span>
      <table style="width:100%;border:none">
        <tr><td style="border:none;text-align:center">Travail - Justice - Solidarité</td></tr>
        <tr><td style="border:none;text-align:center">Caisse Nationale de Sécurité Sociale</td></tr>
      </table>
      <table style="width:100%;margin-top:4px;border:none">
        <tr>
          <td style="background:#ff0000;width:15%;height:4px;border:none"></td>
          <td style="background:#ffff00;width:15%;height:4px;border:none"></td>
          <td style="background:#008000;width:15%;height:4px;border:none"></td>
        </tr>
      </table>
    </div>
    <div style="width:35%">
      <img src="data:image/jpeg;base64,${simandou}" width="140" height="140"
           style="float:right;padding:5px;position:relative;top:-10px" alt=""/>
    </div>
  </div>
</header>

<!-- ── Corps ── -->
<main>

  <!-- Titre -->
  <div style="text-align:center;font-size:20px;font-weight:bold;margin-bottom:16px;letter-spacing:1px">
    APPEL À COTISATION — AFFILIÉ VOLONTAIRE
  </div>

  <!-- Identité affilié -->
  <table style="width:100%;margin-bottom:12px">
    <tr>
      <td style="padding:5px 8px;width:40%;background:#f0f0f0;font-weight:bold">NOM &amp; PRÉNOM</td>
      <td style="padding:5px 8px">${av.nom || ''} ${av.prenom || ''}</td>
      <td style="padding:5px 8px;width:30%;background:#f0f0f0;font-weight:bold">N° IMMATRICULATION</td>
      <td style="padding:5px 8px;font-weight:bold;color:#006400">${av.no_immatriculation || '—'}</td>
    </tr>
    <tr>
      <td style="padding:5px 8px;background:#f0f0f0;font-weight:bold">ADRESSE</td>
      <td style="padding:5px 8px">${av.adresse || '—'}</td>
      <td style="padding:5px 8px;background:#f0f0f0;font-weight:bold">PROFESSION</td>
      <td style="padding:5px 8px">${av.profession || '—'}</td>
    </tr>
    <tr>
      <td style="padding:5px 8px;background:#f0f0f0;font-weight:bold">EMAIL</td>
      <td style="padding:5px 8px">${av.email || '—'}</td>
      <td style="padding:5px 8px;background:#f0f0f0;font-weight:bold">TÉLÉPHONE</td>
      <td style="padding:5px 8px">${av.phone_number || '—'}</td>
    </tr>
  </table>

  <!-- Période + date limite -->
  <div style="display:flex;gap:20px;margin-bottom:12px">
    <div style="border:1px solid #000;padding:6px 14px;font-weight:bold;font-size:14px">
      PÉRIODE : ${periodeLabel} ${annee}
    </div>
    <div style="border:1px solid #000;padding:6px 14px">
      DATE LIMITE DE PAIEMENT : <strong>${dateLimite}</strong>
    </div>
  </div>

  <p style="font-size:11px;color:#555;margin-bottom:14px">
    Votre paiement doit parvenir à la CNSS au plus tard le 20 du mois suivant celui pour lequel
    les cotisations sont dues. Faute de quoi une majoration de retard de 5% sera appliquée.
  </p>

  <!-- Tableau revenus + branches côte à côte -->
  <div style="display:flex;gap:20px;margin-bottom:16px">

    <!-- Revenus -->
    <table style="width:38%">
      <thead>
        <tr style="background:#6cd86c">
          <th colspan="2" style="padding:6px;text-align:center">Base de calcul</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:5px 8px">Revenu annuel déclaré</td>
          <td style="text-align:right;padding:5px 8px">${fmt(revenuAnnuel)} GNF</td>
        </tr>
        <tr>
          <td style="padding:5px 8px">Revenu mensuel</td>
          <td style="text-align:right;padding:5px 8px">${fmt(plafond)} GNF</td>
        </tr>
        <tr style="background:#fffbe6">
          <td style="padding:5px 8px;font-weight:bold">Plafond soumis à cotisation</td>
          <td style="text-align:right;padding:5px 8px;font-weight:bold">${fmt(plafond)} GNF</td>
        </tr>
      </tbody>
    </table>

    <!-- Branches cochées -->
    <table style="flex:1">
      <thead>
        <tr style="background:#6cd86c">
          <th style="padding:6px 8px;text-align:left">Branches</th>
          <th style="padding:6px 8px">Taux</th>
          <th style="padding:6px 8px">Salaire soumis</th>
          <th style="padding:6px 8px">Cotisation</th>
        </tr>
      </thead>
      <tbody>
        ${brancheRows}
        <tr style="background:#e8f5e9">
          <td colspan="3" style="padding:6px 8px;font-weight:bold;text-align:right">TOTAL À PAYER</td>
          <td style="text-align:right;padding:6px 8px;font-weight:bold;font-size:15px;color:#006400">
            ${fmt(montantDu)} GNF
          </td>
        </tr>
      </tbody>
    </table>

  </div>

  <!-- QR code -->
  <div style="margin-top:20px">
    ${codeQR ? `<img src="${codeQR}" alt="QR" width="80" height="80"/>` : ''}
    <p style="font-size:11px;color:#555">Scannez ce QR pour accéder au portail eCNSS</p>
  </div>

</main>

<!-- ── Pied de page ── -->
<footer>
  <div style="text-align:center;font-size:11px;width:100%;border-top:1px solid #ccc;padding-top:6px">
    <strong>République de Guinée</strong><br/>
    Caisse Nationale de Sécurité Sociale, Kouléwondy - Kaloum BP 138<br/>
    www.cnss.gov.gn | Tél : 625 56 56 16
  </div>
</footer>

</body>
</html>`;

  const launchOpts = { headless: 'new', args: PUPPETEER_ARGS, timeout: 30000, protocolTimeout: 60000 };
  const executablePath = resolveChromeExecutable();
  if (executablePath) launchOpts.executablePath = executablePath;

  let browser;
  try {
    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.emulateMediaType('screen');

    const pdfBuffer = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
    await browser.close().catch(() => {});

    console.log(`[AppelCotisationAV] PDF généré (buffer) — ${av.no_immatriculation || av.id} ${decl.periode}/${annee}`);
    return Buffer.from(pdfBuffer);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[AppelCotisationAV] Erreur génération PDF:', err.message);
    throw err;
  }
}

module.exports = { generateAppelCotisationAv };
