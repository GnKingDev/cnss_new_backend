/**
 * utility3.js – Génération PDF (Puppeteer) et envoi SMS Orange
 * À la racine du projet. Utilisé par db/cotisation_employeur, db/employe, etc.
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname);
const IMAGE_PATHS = {
  logo: path.join(ROOT_DIR, 'CNSS.jpg'),
  branding: path.join(ROOT_DIR, 'db/document/branding.png'),
  simandou: path.join(ROOT_DIR, 'simandou.jpeg')
};

/** Charge une image en base64 ou retourne une chaîne vide si fichier absent */
function readImageBase64(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath).toString('base64');
    }
  } catch (err) {
    console.warn(`[utility3] Image non trouvée: ${filePath}`, err.message);
  }
  return '';
}

/** En-tête HTML commun (CNSS, drapeau) */
function getHeaderHtml(logoBase64, simandouBase64) {
  return `
    <div class="header">
      <div style="display: flex">
        <div style="width: 35%">
          <img src="data:image/png;base64,${logoBase64}" width="200" height="100" alt="CNSS" />
        </div>
        <div style="width: 40%; margin-top: 15px; text-align: center">
          <span style="font-size: 20px">RÉPUBLIQUE DE GUINÉE</span>
          <table style="width: 100%">
            <tr><td style="width: 100%">Travail - Justice - Solidarité</td></tr>
            <tr><td style="width: 100%">Caisse Nationale de Sécurité Sociale</td></tr>
          </table>
          <table style="width: 100%">
            <tr>
              <td style="background-color: red; width: 15%; height: 2px"></td>
              <td style="background-color: yellow; width: 15%"></td>
              <td style="background-color: green; width: 15%"></td>
            </tr>
          </table>
        </div>
        <div style="width: 35%">
          <img src="data:image/png;base64,${simandouBase64}" width="150" height="150"
            style="float: right; padding: 5px; position: relative; top: -10px" alt="" />
        </div>
      </div>
    </div>`;
}

/** Pied de page HTML commun */
function getFooterHtml() {
  return `
    <footer>
      <div style="text-align: center; font-size: 12px; width: 100%">
        <span style="font-weight: bold">République de Guinée</span><br />
        <span>Caisse Nationale de sécurité Sociale, Kouléwondy - Kaloum BP 138</span><br />
        <span>République de Guinée | www.ecnss.gov.gn | Tel: 625565616</span>
      </div>
    </footer>`;
}

/** Styles CSS communs pour les PDF */
const COMMON_STYLES = `
  @page { margin: 0cm 0cm; }
  body {
    margin-top: 2cm; margin-left: 1cm; margin-right: 1cm; margin-bottom: 1cm;
    font-family: "Poppins", sans-serif;
  }
  .header { position: relative; top: -2cm; left: 0; right: 0; height: 4cm; }
  main { position: relative; top: -80px !important; }
  footer { position: relative; bottom: 0; left: 0; right: 0; height: 2cm; display: flex !important; }
  .liste table { width: 100%; border-collapse: collapse; border: 1px solid black; overflow-x: auto; }
  .liste table th, .liste table td { border: 1px solid black; text-align: center; }
`;

/**
 * Génère un PDF liste des employé(e)s (employeur).
 * @param {Array} data - Liste des employés (no_immatriculation, first_name, last_name, salary, date_of_birth, immatriculation_date, statut)
 * @param {object} employeur - { raison_sociale, adresse, no_immatriculation }
 * @returns {Promise<Buffer>}
 */
async function genereListePdf(data, employeur) {
  let browser;
  try {
    const puppeteer = require('puppeteer');
    const logo = readImageBase64(IMAGE_PATHS.logo);
    const simandou = readImageBase64(IMAGE_PATHS.simandou);

    const rows = (data || []).map((el) => {
      const salary = el.salary != null ? Number(el.salary).toLocaleString('en-US') : '0';
      const dob = el.date_of_birth ? new Date(el.date_of_birth).toLocaleDateString('fr-FR') : '';
      const immat = el.immatriculation_date ? new Date(el.immatriculation_date).toLocaleDateString('fr-FR') : '';
      return `
        <tr>
          <td>${el.no_immatriculation ?? ''}</td>
          <td>${el.first_name ?? ''} ${el.last_name ?? ''}</td>
          <td>${salary}</td>
          <td>${dob}</td>
          <td>${immat}</td>
          <td>${el.statut ?? ''}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Liste des employés</title>
    <style>${COMMON_STYLES}</style>
  </head>
  <body>
    ${getHeaderHtml(logo, simandou)}
    <main style="font-size: 14px">
      <table style="margin-top: 15px">
        <tbody>
          <tr><td style="padding-bottom: 10px">RAISON SOCIALE:</td><td>${employeur?.raison_sociale ?? ''}</td></tr>
          <tr><td style="padding-bottom: 10px">ADRESSE:</td><td>${employeur?.adresse ?? ''}</td></tr>
          <tr><td style="padding-bottom: 10px">N°EMPLOYEUR:</td><td>${employeur?.no_immatriculation ?? ''}</td></tr>
        </tbody>
      </table>
      <hr style="margin-bottom: 0" /><hr style="margin-top: 1px" />
      <h4 style="text-align: center">LISTE DES EMPLOYÉ(E)S</h4>
      <div class="liste">
        <table>
          <thead>
            <tr>
              <th>N° Immatriculation</th>
              <th>Prénom(s) & Nom</th>
              <th>Salaire</th>
              <th>Date Naissance</th>
              <th>Date Immatriculation</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </main>
    ${getFooterHtml()}
  </body>
</html>`;

    browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, landscape: true });
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Génère un PDF liste des cotisations (déclaration).
 * @param {Array} data - Liste (no_immatriculation, first_name, last_name, salary_brut, ssc, cotisation_employe, cotisation_emplyeur)
 * @param {object} employeur - { raison_sociale, adresse, no_immatriculation }
 * @param {string} periode - Ex: JANVIER
 * @param {string|number} year - Année
 * @returns {Promise<Buffer>}
 */
async function generelistDeclaration(data, employeur, periode, year) {
  let browser;
  try {
    const puppeteer = require('puppeteer');
    const logo = readImageBase64(IMAGE_PATHS.logo);
    const simandou = readImageBase64(IMAGE_PATHS.simandou);

    const fmt = (n) => (n != null && !Number.isNaN(Number(n)) ? Number(n).toLocaleString('en-US') : '0');

    const rows = (data || []).map((el) => `
      <tr>
        <td style="width: 10%">${el.no_immatriculation ?? ''}</td>
        <td style="width: 60%">${el.first_name ?? ''} ${el.last_name ?? ''}</td>
        <td style="width: 10%">${fmt(el.salary_brut)}</td>
        <td style="width: 10%">${fmt(el.ssc)}</td>
        <td style="width: 5%">${fmt(el.cotisation_employe)}</td>
        <td style="width: 5%">${fmt(el.cotisation_emplyeur)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Liste cotisations ${periode}-${year}</title>
    <style>${COMMON_STYLES}</style>
  </head>
  <body>
    ${getHeaderHtml(logo, simandou)}
    <main style="font-size: 14px">
      <table style="margin-top: 15px">
        <tbody>
          <tr><td style="padding-bottom: 10px">RAISON SOCIALE:</td><td>${employeur?.raison_sociale ?? ''}</td></tr>
          <tr><td style="padding-bottom: 10px">ADRESSE:</td><td>${employeur?.adresse ?? ''}</td></tr>
          <tr><td style="padding-bottom: 10px">N°EMPLOYEUR:</td><td>${employeur?.no_immatriculation ?? ''}</td></tr>
        </tbody>
      </table>
      <hr style="margin-bottom: 0" /><hr style="margin-top: 1px" />
      <h4 style="text-align: center">LISTE COTISATIONS ${periode}-${year}</h4>
      <div class="liste">
        <table>
          <thead>
            <tr>
              <th>N° Immatriculation</th>
              <th>Prénom(s) & Nom</th>
              <th>Salaire Brut</th>
              <th>SSC</th>
              <th>Part Employés</th>
              <th>Part Employeur</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </main>
    ${getFooterHtml()}
  </body>
</html>`;

    browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, landscape: true });
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  genereListePdf,
  generelistDeclaration
};
