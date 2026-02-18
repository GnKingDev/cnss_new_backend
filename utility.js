/**
 * utility.js – Racine du projet
 * Fournit : util_link, upload (multer), getFileAppelCotisation (PDF appel de cotisations)
 * Utilisé par : db/adhesion/route.full.js, db/affiliation-volontaire/route.full.js, db/cotisation_employeur/route.full.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const ROOT_DIR = path.resolve(__dirname);
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const DOCS_DIR = path.join(ROOT_DIR, 'document', 'docs');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

// ——— util_link (API ancienne base) ———
const util_link = process.env.OLD_DB_API_URL || 'http://192.168.56.128';

// ——— upload (multer) ———
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const base = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/\s+/g, '-')
      .substring(0, 80);
    const ext = path.extname(file.originalname) || '';
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, base + '-' + unique + ext);
  }
});
const upload = multer({ storage });

/** Incrémente les 7 derniers chiffres d'un numéro d'immatriculation. */
function incrementLastSixDigits(str) {
  if (!str || str.length < 7) return str;
  const lastSeven = str.substring(str.length - 7);
  const incremented = (parseInt(lastSeven, 10) + 1).toString().padStart(7, '0');
  return str.substring(0, str.length - 7) + incremented;
}

// ——— Mois pour PDF appel cotisations ———
const MONTHS_APPEL = [
  { name: 'JANVIER', code: '01' }, { name: 'FEVRIER', code: '02' }, { name: 'MARS', code: '03' },
  { name: 'AVRIL', code: '04' }, { name: 'MAI', code: '05' }, { name: 'JUIN', code: '06' },
  { name: 'JUILLET', code: '07' }, { name: 'AOUT', code: '08' }, { name: 'SEPTEMBRE', code: '09' },
  { name: 'OCTOBRE', code: '10' }, { name: 'NOVEMBRE', code: '11' }, { name: 'DECEMBRE', code: '12' },
  { name: '13e MOIS', code: '13e MOIS' }, { name: '14e MOIS', code: '14e MOIS' }, { name: '15e MOIS', code: '15e MOIS' }
];

function readImageBase64(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath).toString('base64');
    }
  } catch (err) {
    console.warn('[utility] Image non trouvée:', filePath, err.message);
  }
  return '';
}

/**
 * Génère le PDF "Appel de cotisations" et l'enregistre dans document/docs.
 * @param {string} name - Nom du fichier (sans .pdf)
 * @param {object} cotisation - Objet cotisation (periode, year, effectif_*, total_salary, etc.)
 * @param {string} facture_name - Libellé (ex. "FACTURE")
 * @param {object} employeur - Objet employeur (raison_sociale, adresse, email, phone_number, no_immatriculation)
 * @param {string} code - Code unique affiché sur le PDF
 * @returns {Promise<string>} Chemin du fichier PDF généré
 */
async function getFileAppelCotisation(name, cotisation, facture_name, employeur, code) {
  let puppeteer;
  let QRCode;
  try {
    puppeteer = require('puppeteer');
    QRCode = require('qrcode');
  } catch (e) {
    return Promise.reject(new Error('puppeteer ou qrcode non installé pour getFileAppelCotisation'));
  }

  const logoPath = path.join(ROOT_DIR, 'CNSS.jpg');
  const simandouPath = path.join(ROOT_DIR, 'simandou.jpeg');
  const logo = readImageBase64(logoPath);
  const simandou = readImageBase64(simandouPath);

  let codeQR = '';
  try {
    codeQR = await QRCode.toDataURL('https://e.cnss.gov.gn/#/', { width: 100, color: { dark: '#000000', light: '#ffffff' } });
  } catch (err) {
    console.warn('[utility] QRCode non généré:', err.message);
  }

  const periodeInfo = MONTHS_APPEL.find(m => m.name === (cotisation?.periode || '')) || { code: cotisation?.periode || '' };
  const periode = typeof periodeInfo === 'object' ? periodeInfo.code : cotisation?.periode || '';
  const emp = employeur || {};
  const cot = cotisation || {};
  const fmt = (n) => (n != null && !isNaN(n) ? Number(n).toLocaleString('en-US') : '0');

  const factureHtml = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appel de cotisations</title>
  <style>
    @page { margin: 0cm 0cm; }
    body { margin-top: 2cm; margin-left: 2cm; margin-right: 2cm; margin-bottom: 2cm; font-family: 'Poppins', sans-serif; }
    header { position: fixed; top: 0; left: 0; right: 0; height: 4cm; }
    main { position: relative; top: 80px !important; }
    footer { position: fixed; bottom: 0; left: 0; right: 0; height: 2cm; display: flex !important; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #000; }
  </style>
</head>
<body>
  <header>
    <div style="display: flex">
      <div style="width: 35%">
        <img src="data:image/png;base64,${logo}" width="200" height="100" alt="CNSS" />
      </div>
      <div style="width: 40%; margin-top: 15px; text-align: center">
        <span style="font-size: 20px">RÉPUBLIQUE DE GUINÉE</span>
        <table style="width: 100%">
          <tr><td>Travail - Justice - Solidarité</td></tr>
          <tr><td>Caisse Nationale de Sécurité Sociale</td></tr>
        </table>
        <table style="width: 100%">
          <tr>
            <td style="background-color: #ff0000; width: 15%; height: 2px"></td>
            <td style="background-color: #ffff00; width: 15%"></td>
            <td style="background-color: #008000; width: 15%"></td>
          </tr>
        </table>
      </div>
      <div style="width: 35%">
        <img src="data:image/png;base64,${simandou}" width="150" height="150" style="float: right; padding: 5px; position: relative; top: -10px" alt="" />
      </div>
    </div>
  </header>
  <main style="font-size: 14px">
    <div style="text-align: center; font-size: 2rem; margin-left: 15px; margin-bottom: 10px">APPEL DE COTISATIONS</div>
    <table style="margin-left: 15px">
      <tr><td>NOM OU RAISON SOCIALE DE L'EMPLOYEUR :</td><td>${emp.raison_sociale || ''}</td></tr>
    </table>
    <div style="display: flex; margin: 15px">
      <div style="width: 35%"><span>ADRESSE COMPLÈTE : ${emp.adresse || ''}</span></div>
      <div style="width: 35%"><span>EMAIL : ${emp.email || ''}</span></div>
      <div style="width: 35%"><span>TEL : +224 ${emp.phone_number || ''}</span></div>
    </div>
    <div style="display: flex; margin: 15px">
      <div style="width: 25%; border: 1px solid #000; padding: 5px; margin-right: 20px"><span>PÉRIODE : ${periode}/${cot.year || ''}</span></div>
      <div style="width: 35%; border: 1px solid #000; padding: 5px; margin-left: 30px"><span>NUMÉRO EMPLOYEUR : ${emp.no_immatriculation || ''}</span></div>
    </div>
    <p style="margin-left: 15px">
      Votre paiement doit parvenir à la CNSS au plus tard le 20 du mois suivant celui pour lequel les cotisations sont dues. Faute de quoi une majoration de retard de 5% sera appliquée.
    </p>
    <div style="display: flex; margin-left: 15px">
      <table style="width: 40%; margin-right: 20px">
        <tr><td>Effectif embauché le mois en cours</td><td style="text-align: right">${cot.effectif_embauche ?? ''}</td></tr>
        <tr><td>Effectif ayant quitté au cours du mois</td><td style="text-align: right">${cot.effectif_leave ?? ''}</td></tr>
        <tr><td>Effectif du mois</td><td style="text-align: right">${cot.current_effectif ?? ''}</td></tr>
        <tr><td>Salaire total payé en cours du mois</td><td style="text-align: right">${fmt(cot.total_salary)}</td></tr>
        <tr><td>Salaire total soumis à cotisation</td><td style="text-align: right">${fmt(cot.total_salary_soumis_cotisation)}</td></tr>
      </table>
      <div style="width: 60%">
        <table style="width: 100%">
          <thead>
            <tr style="background-color: rgb(108, 216, 108)">
              <th>Branches</th><th>Taux</th><th>Salaire soumis</th><th>Cotisation</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Prestations Familiales</td><td style="text-align: center">6.0%</td><td style="text-align: right">${fmt(cot.total_salary_soumis_cotisation)}</td><td style="text-align: right">${fmt(cot.prestation_familiale)}</td></tr>
            <tr><td>Risques Professionnels</td><td style="text-align: center">4.0%</td><td style="text-align: right">${fmt(cot.total_salary_soumis_cotisation)}</td><td style="text-align: right">${fmt(cot.risque_professionnel)}</td></tr>
            <tr><td>Assurance Maladie</td><td style="text-align: center">6.5%</td><td style="text-align: right">${fmt(cot.total_salary_soumis_cotisation)}</td><td style="text-align: right">${fmt(cot.assurance_maladie)}</td></tr>
            <tr><td>Vieillesse - Décès - invalidité</td><td style="text-align: center">6.5%</td><td style="text-align: right">${fmt(cot.total_salary_soumis_cotisation)}</td><td style="text-align: right">${fmt(cot.vieillesse)}</td></tr>
            <tr><td colspan="3">Total</td><td style="text-align: right">${fmt(cot.total_branche)}</td></tr>
          </tbody>
        </table>
        <div style="display: flex; width: 100%; margin-top: 10px">
          <div style="width: 50%"><span>NB: Plancher en vigueur: 550 000 GNF</span></div>
          <div style="width: 50%"><span style="text-align: right">Plafond en vigueur: 2 500 000 GNF</span></div>
        </div>
      </div>
    </div>
    <div style="text-align: left; margin-top: 23px; width: 80%">
      ${codeQR ? `<img src="${codeQR}" alt="QR" />` : ''}
      <p><strong>CODE : ${code || ''}</strong></p>
    </div>
  </main>
  <footer>
    <div style="text-align: center; font-size: 12px; width: 100%">
      <span style="font-weight: bold">République de Guinée</span><br />
      <span>Caisse Nationale de sécurité Sociale, Kouléwondy - Kaloum BP 138</span><br />
      <span>République de Guinée | www.cnss.gov.gn</span>
    </div>
  </footer>
</body>
</html>`;

  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(factureHtml, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    const pdfPath = path.join(DOCS_DIR, `${name}.pdf`);
    await page.pdf({ path: pdfPath, format: 'A4', landscape: true, printBackground: true });
    return pdfPath;
  } catch (err) {
    console.error('[utility] getFileAppelCotisation:', err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Génère le PDF "Notification d'immatriculation" et l'enregistre dans document/docs.
 * @param {string} name - Nom du fichier (sans .pdf)
 * @param {object} employeur - Objet employeur (raison_sociale, adresse, no_immatriculation, category, createdAt, date_creation)
 * @param {string} code - Code unique affiché sur le PDF
 * @returns {Promise<string>} Chemin du fichier PDF ou nom du fichier
 */
async function generatedNotification(name, employeur, code) {
  let puppeteer;
  let QRCode;
  try {
    puppeteer = require('puppeteer');
    QRCode = require('qrcode');
  } catch (e) {
    return Promise.reject(new Error('puppeteer ou qrcode non installé pour generatedNotification'));
  }

  const logoPath = path.join(ROOT_DIR, 'CNSS.jpg');
  const simandouPath = path.join(ROOT_DIR, 'simandou.jpeg');
  const logo = readImageBase64(logoPath);
  const simandou = readImageBase64(simandouPath);

  let codeQR = '';
  try {
    codeQR = await QRCode.toDataURL('https://e.cnss.gov.gn/#/', { width: 100, color: { dark: '#000000', light: '#ffffff' } });
  } catch (err) {
    console.warn('[utility] QRCode non généré:', err.message);
  }

  const emp = employeur || {};
  const notifHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Notification d'immatriculation</title>
  <style>@page{margin:0} body{margin:2cm;font-family:'Poppins',sans-serif} header{position:fixed;top:0;left:0;right:0;height:4cm} main{position:relative;top:80px !important} footer{position:fixed;bottom:0;left:0;right:0;height:2cm;display:flex !important}</style></head><body>
  <header><div style="display:flex"><div style="width:35%"><img src="data:image/png;base64,${logo}" width="200" height="100" alt="CNSS"/></div>
  <div style="width:40%;margin-top:15px;text-align:center"><span style="font-size:20px">RÉPUBLIQUE DE GUINÉE</span><table style="width:100%"><tr><td>Travail - Justice - Solidarité</td></tr><tr><td>Caisse Nationale de Sécurité Sociale</td></tr></table>
  <table style="width:100%"><tr><td style="background:red;width:15%;height:2px"></td><td style="background:yellow;width:15%"></td><td style="background:green;width:15%"></td></tr></table></div>
  <div style="width:35%"><img src="data:image/png;base64,${simandou}" width="150" height="150" style="float:right;padding:5px;position:relative;top:-10px" alt=""/></div></div></header>
  <main style="font-size:18px"><div style="text-align:center;margin-top:25px">DIRECTION IMMATRICULATION RECOUVREMENT ET GESTION DES ASSURÉS - SERVICE IMMATRICULATION</div>
  <div style="width:70%;margin:auto;font-size:10px;text-align:center;padding:2px;margin-top:30px;background:rgb(108,216,108)"><h1>NOTIFICATION D'IMMATRICULATION</h1></div>
  <table style="margin-top:25px"><tr><th style="width:30%;text-align:left">RAISON SOCIALE:</th><td>${emp.raison_sociale ?? ''}</td></tr><tr><th style="width:30%;text-align:left">ADRESSE:</th><td>${emp.adresse ?? ''}</td></tr></table>
  <p style="text-align:justify;width:100%">La C.N.S.S a l'honneur de vous informer que suite à votre demande d'immatriculation en date du <strong>${emp.createdAt ? new Date(emp.createdAt).toLocaleDateString('fr') : ''}</strong>, votre entreprise <strong>${emp.raison_sociale ?? ''}</strong> est inscrite à la C.N.S.S en qualité d'employeur sous le numéro <strong>${emp.no_immatriculation ?? ''}</strong> avec pour effet le <strong>${emp.date_creation ? new Date(emp.date_creation).toLocaleDateString('fr') : ''}</strong>.<br/>Désormais, votre entreprise sera tenue par le service des cotisations sous ce numéro. Vous êtes classé à la catégorie <strong>${emp.category ?? ''}</strong>. À la fin de chaque mois, vous êtes invités à verser les cotisations. Taux : 23 % (Prestations familiales 6 %, Risques professionnels 4 %, Assurance maladie 6,5 %, Pensions 6,5 %).</p>
  <div style="display:flex"><div style="text-align:left;margin-top:23px;width:80%">${codeQR ? `<img src="${codeQR}" alt="QR"/>` : ''}<p><strong>CODE: ${code ?? ''}</strong></p></div><p style="text-align:right;margin-top:23px">Conakry ${new Date().toLocaleDateString('fr')}.<br/>POUR LE DIRECTEUR GÉNÉRAL LE DÉLÉGUÉ</p></div>
  </main>
  <footer><div style="text-align:center;font-size:12px;width:100%"><span style="font-weight:bold">République de Guinée</span><br/><span>Caisse Nationale de sécurité Sociale, Kouléwondy - Kaloum BP 138</span><br/><span>République de Guinée | www.cnss.gov.gn</span></div></footer></body></html>`;

  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(notifHtml, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    const pdfPath = path.join(DOCS_DIR, `${name}.pdf`);
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    return pdfPath;
  } catch (err) {
    console.error('[utility] generatedNotification:', err.message);
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = {
  util_link,
  upload,
  incrementLastSixDigits,
  getFileAppelCotisation,
  generatedNotification
};
