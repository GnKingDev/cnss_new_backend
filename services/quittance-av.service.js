/**
 * Service de génération de quittance pour Affiliation Volontaire.
 * Inspiré de genereQuittance (utility2.js) — même structure HTML/PDF, données AV.
 */

const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');

const ROOT_DIR = path.resolve(__dirname, '..');
// Note : aucun fichier n'est écrit sur disque — génération buffer uniquement

const IMAGE_PATHS = {
  logo:     path.join(ROOT_DIR, 'CNSS.jpg'),
  simandou: path.join(ROOT_DIR, 'simandou.jpeg'),
  signature: path.join(ROOT_DIR, 'signature.jpg'),
};

const PUPPETEER_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--disable-gpu', '--disable-software-rasterizer', '--no-first-run',
  '--disable-extensions', '--disable-background-networking',
];

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

/** Libellé du mois en français */
function moisLabel(periode) {
  const mois = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const idx = parseInt(periode, 10) - 1;
  return mois[idx] ?? periode;
}

/** Libellé méthode de paiement */
function methodLabel(payment_method) {
  if (!payment_method) return 'Mobile Money';
  if (payment_method.includes('OM')) return 'Orange Money';
  if (payment_method.includes('MOMO')) return 'MTN MoMo';
  return payment_method.replace('DJOMY_', '');
}

/**
 * Génère le PDF de quittance AV en mémoire (buffer) — rien n'est écrit sur disque.
 * @param {object} declaration - instance plain de DeclarationAffiliationVolontaire
 * @param {object} affiliation - instance plain de AffiliationVolontaire
 * @param {string} code        - code secret unique
 * @returns {Promise<Buffer>}  - buffer PDF
 */
async function generateQuittanceAv(declaration, affiliation, code) {

  const logo      = readImageBase64(IMAGE_PATHS.logo);
  const simandou  = readImageBase64(IMAGE_PATHS.simandou);
  const signature = readImageBase64(IMAGE_PATHS.signature) || readImageBase64(IMAGE_PATHS.simandou);

  let codeQR = '';
  try {
    codeQR = await QRCode.toDataURL('https://e.cnss.gov.gn/#/', { width: 100, color: { dark: '#000000', light: '#ffffff' } });
  } catch (_) {}

  const av      = affiliation || {};
  const decl    = declaration || {};
  const montant = Number(decl.montant_cotisation || 0).toLocaleString('fr-FR');
  const periode = moisLabel(decl.periode || '');
  const annee   = decl.year || '';
  const datePaiement = decl.updatedAt ? new Date(decl.updatedAt).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');

  const prestations = [
    av.is_assurance_maladie_active    ? `Assurance maladie ${(Number(av.assurance_maladie_percentage || 0.065) * 100).toFixed(1)}%`    : null,
    av.is_risque_professionnel_active ? `Risque professionnel ${(Number(av.risque_professionnel_percentage || 0.06) * 100).toFixed(1)}%` : null,
    av.is_vieillesse_active           ? `Vieillesse ${(Number(av.vieillesse_percentage || 0.065) * 100).toFixed(1)}%`                   : null,
  ].filter(Boolean).join(' • ') || '—';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Quittance AV</title>
  <style>
    @page { margin: 0 }
    body { margin: 2cm; font-family: 'Poppins', Arial, sans-serif; }
    header { position: fixed; top: 0; left: 0; right: 0; height: 4cm; }
    main { position: relative; top: 80px; }
    footer { position: fixed; bottom: 0; left: 0; right: 0; height: 2cm; }
    table { border-collapse: collapse; }
    td, th { vertical-align: top; }
  </style>
</head>
<body>

<header>
  <div style="display:flex">
    <div style="width:35%">
      <img src="data:image/jpeg;base64,${logo}" width="200" height="100" alt="CNSS"/>
    </div>
    <div style="width:40%;margin-top:15px;text-align:center">
      <span style="font-size:20px">RÉPUBLIQUE DE GUINÉE</span>
      <table style="width:100%">
        <tr><td>Travail - Justice - Solidarité</td></tr>
        <tr><td>Caisse Nationale de Sécurité Sociale</td></tr>
      </table>
      <table style="width:100%">
        <tr>
          <td style="background:red;width:15%;height:4px"></td>
          <td style="background:yellow;width:15%;height:4px"></td>
          <td style="background:green;width:15%;height:4px"></td>
        </tr>
      </table>
    </div>
    <div style="width:35%">
      <img src="data:image/jpeg;base64,${simandou}" width="150" height="150" style="float:right;padding:5px" alt=""/>
    </div>
  </div>
</header>

<main style="font-size:14px">
  <div style="width:70%;margin:auto;font-size:10px;text-align:center;padding:4px;margin-top:30px;background:rgb(108,216,108)">
    <h1 style="margin:0">QUITTANCE DE COTISATION — AFFILIATION VOLONTAIRE</h1>
  </div>

  <!-- Infos affilié -->
  <table style="margin-top:20px;width:100%">
    <tbody>
      <tr>
        <td style="width:30%;padding-bottom:10px;font-weight:bold">N° QUITTANCE :</td>
        <td>${av.no_immatriculation || ''}${decl.periode || ''}${annee}</td>
      </tr>
      <tr>
        <td style="padding-bottom:10px;font-weight:bold">N° IMMATRICULATION :</td>
        <td>${av.no_immatriculation || '—'}</td>
      </tr>
      <tr>
        <td style="padding-bottom:10px;font-weight:bold">NOM &amp; PRÉNOM :</td>
        <td>${av.nom || ''} ${av.prenom || ''}</td>
      </tr>
      <tr>
        <td style="padding-bottom:10px;font-weight:bold">ADRESSE :</td>
        <td>${av.adresse || '—'}</td>
      </tr>
      <tr>
        <td style="padding-bottom:10px;font-weight:bold">PROFESSION :</td>
        <td>${av.profession || '—'}</td>
      </tr>
    </tbody>
  </table>

  <div style="display:flex;margin-bottom:10px">
    <div style="width:30%;font-weight:bold">EMAIL :</div>
    <div style="width:35%">${av.email || '—'}</div>
    <div style="width:20%;font-weight:bold">TÉLÉPHONE :</div>
    <div style="width:35%">${av.phone_number || '—'}</div>
  </div>

  <hr/>

  <!-- Détail financier -->
  <table style="width:100%;margin-top:10px">
    <tbody>
      <tr>
        <td style="padding-bottom:10px">MONTANT À PAYER</td>
        <td style="text-align:right;font-weight:bold">${montant} GNF</td>
      </tr>
      <tr>
        <td style="padding-bottom:10px">PRESTATIONS SOUSCRITES</td>
        <td style="text-align:right">${prestations}</td>
      </tr>
      <tr>
        <td style="padding-bottom:10px">MONTANT PAYÉ</td>
        <td style="text-align:right;font-weight:bold">${montant} GNF</td>
      </tr>
      <tr>
        <td style="padding-bottom:10px">RESTE À PAYER</td>
        <td style="text-align:right">0 GNF</td>
      </tr>
      <tr>
        <td style="padding-bottom:10px">DATE DE PAIEMENT</td>
        <td style="text-align:right">${datePaiement}</td>
      </tr>
      <tr>
        <td style="padding-bottom:10px">PÉRIODE DE PAIEMENT</td>
        <td style="text-align:right">${periode} ${annee}</td>
      </tr>
      <tr>
        <td style="padding-bottom:10px">MODE DE PAIEMENT</td>
        <td style="text-align:right">${methodLabel(decl.payment_method)}</td>
      </tr>
      <tr>
        <td style="padding-bottom:10px">RÉFÉRENCE TRANSACTION</td>
        <td style="text-align:right">${decl.djomy_transaction_id || '—'}</td>
      </tr>
      <tr>
        <td style="padding-bottom:10px">MAJORATION DUE</td>
        <td style="text-align:right">0 GNF</td>
      </tr>
    </tbody>
  </table>

  <!-- QR + Signature -->
  <div style="display:flex;margin-top:20px">
    <div style="text-align:left;width:60%">
      ${codeQR ? `<img src="${codeQR}" alt="QR"/>` : ''}
      <p><strong>CODE : ${code}</strong></p>
    </div>
    <div style="text-align:right;width:40%">
      <p>${new Date().toLocaleString('fr-FR')}</p>
      <p>Le Directeur Général</p>
      <img src="data:image/jpeg;base64,${signature}" width="200" height="100" alt="Signature"/>
      <p><strong>M. Bakary Sylla</strong></p>
    </div>
  </div>
</main>

<footer>
  <div style="text-align:center;font-size:11px;width:100%">
    <span style="font-weight:bold">République de Guinée</span><br/>
    <span>Caisse Nationale de Sécurité Sociale, Kouléwondy - Kaloum BP 138</span><br/>
    <span>www.cnss.gov.gn | Tel : 625 565 616</span>
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
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.emulateMediaType('screen');
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close().catch(() => {});
    return Buffer.from(pdfBuffer);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[QuittanceAV] Erreur génération PDF:', err.message);
    throw err;
  }
}

module.exports = { generateQuittanceAv };
