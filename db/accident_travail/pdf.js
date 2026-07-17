/**
 * Génération du PDF "Modèle de Déclaration d'Accident du Travail" (eADT).
 * Modèle officiel CNSS : seuls la raison sociale + n° d'immatriculation de l'employeur
 * (section EMPLOYEUR) et le n° d'immatriculation de l'employé (section VICTIME) sont
 * pré-remplis. Le reste du formulaire reste vierge, à compléter/signer/cacheter à la main.
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DOCS_DIR = path.join(ROOT_DIR, 'document', 'docs');
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

function readImageBase64(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath).toString('base64');
    }
  } catch (err) {
    console.warn('[accident_travail/pdf] Image non trouvée:', filePath, err.message);
  }
  return '';
}

/** Résout le binaire Chrome local (chrome/) – même approche que utility.js. */
function resolveChromeExecutable() {
  const chromeDir = path.join(ROOT_DIR, 'chrome');
  if (!fs.existsSync(chromeDir)) return null;
  try {
    const dirs = fs.readdirSync(chromeDir);
    const macDir = dirs.find((d) => d.startsWith('mac_arm-') || d.startsWith('mac-'));
    if (macDir) {
      const base = path.join(chromeDir, macDir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      if (fs.existsSync(base)) return base;
    }
    const linuxDir = dirs.find((d) => d.startsWith('linux-'));
    if (linuxDir) {
      const linuxPath = path.join(chromeDir, linuxDir, 'chrome-linux64', 'chrome');
      if (fs.existsSync(linuxPath)) return linuxPath;
    }
  } catch (err) {
    console.warn('[accident_travail/pdf] Chrome local non trouvé:', err.message);
  }
  return null;
}

function esc(v) {
  return v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Génère le PDF officiel "Déclaration d'Accident du Travail", avec uniquement
 * la raison sociale + n° d'immatriculation de l'employeur et le n° d'immatriculation
 * de l'employé pré-remplis.
 * @param {string} name - Nom du fichier (sans .pdf)
 * @param {object} employeur - { raison_sociale, no_immatriculation }
 * @param {object} employe - { no_immatriculation }
 * @returns {Promise<{ pdfPath: string, buffer: Buffer }>}
 */
async function generateAccidentTravailModel(name, employeur, employe) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    return Promise.reject(new Error('puppeteer non installé pour generateAccidentTravailModel'));
  }

  const logoPath = path.join(ROOT_DIR, 'CNSS.jpg');
  const simandouPath = path.join(ROOT_DIR, 'simandou.jpeg');
  const logo = readImageBase64(logoPath);
  const simandou = readImageBase64(simandouPath);

  const emp = employeur || {};
  const sal = employe || {};
  const raisonSociale = esc(emp.raison_sociale);
  const noImmatEmployeur = esc(emp.no_immatriculation);
  const noImmatEmploye = esc(sal.no_immatriculation);

  const html = `
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>Déclaration d'Accident du Travail - CNSS Guinée</title>
    <style>
      @page { size: A4; margin: 1.2cm; }
      * { box-sizing: border-box; }
      body { font-family: 'Georgia', 'Times New Roman', serif; background: #ffffff; margin: 0; padding: 30px; color: #1a1a1a; }
      .sheet { max-width: 900px; margin: 0 auto; background: #ffffff; padding: 40px 45px; }
      .title-box { margin: 40px 40px; border: 2px solid #000; padding: 10px 15px; text-align: center; margin-bottom: 25px; }
      .title-box h1 { font-size: 20px; margin: 0 0 4px 0; letter-spacing: 0.5px; }
      .subtitle { font-style: italic; font-size: 13px; margin-bottom: 8px; }
      .instructions { font-size: 11px; line-height: 1.4; }
      .attention-box { border: 1px solid #000; padding: 10px 15px; font-size: 13px; margin-bottom: 20px; line-height: 1.6; }
      .warning-box { border: 1px solid #f0ad4e; background: #fff3cd; color: #664d03; padding: 10px 15px; font-size: 13px; margin-bottom: 20px; line-height: 1.6; }
      .engagement-box { border: 2px solid #1a3a5c; background: #f4f7fb; padding: 15px 18px; margin-top: 22px; margin-bottom: 20px; }
      .engagement-box .section-bar { background: #1a3a5c; margin-top: 0; }
      .checkbox { display: inline-block; width: 12px; height: 12px; border: 1.5px solid #000; margin-right: 4px; vertical-align: middle; }
      .section-bar { background: #000; color: #fff; text-align: center; font-size: 17px; letter-spacing: 2px; font-weight: bold; padding: 6px 0; margin-top: 22px; margin-bottom: 14px; }
      .field-row { display: flex; align-items: baseline; margin-bottom: 14px; font-size: 14px; flex-wrap: wrap; }
      .field-label { white-space: nowrap; margin-right: 6px; }
      .field-value { font-weight: bold; margin-right: 6px; }
      .field-line { flex: 1; border-bottom: 1px solid #000; min-width: 100px; height: 1.2em; }
      .field-half { display: flex; align-items: baseline; width: 48%; }
      .checkbox-inline { margin-left: 10px; white-space: nowrap; }
      .accident-block { font-size: 14px; margin-bottom: 10px; line-height: 1.8; }
      .spacer { height: 10px; }
      .conseq-row { display: flex; gap: 40px; align-items: center; font-size: 14px; margin-top: 20px; }
      footer { display: flex; margin-top: 30px; }
      @media print {
        body { padding: 0; }
        .sheet { max-width: 100%; margin: 0; padding: 0; box-shadow: none; }
        .form-section, .accident-section, .engagement-box { break-inside: avoid; page-break-inside: avoid; }
        .temoins-tiers-section { break-before: page; page-break-before: always; break-inside: avoid; page-break-inside: avoid; }
        .title-box, .section-bar, .attention-box, .warning-box, .engagement-box, .field-row, .field-half, .accident-block, .conseq-row, footer {
          break-inside: avoid; page-break-inside: avoid;
        }
        .section-bar { break-after: avoid; page-break-after: avoid; }
        header img { height: 100px !important; width: auto !important; }
      }
    </style>
  </head>
  <body>
    <header>
      <div style="display: flex">
        <div style="width: 35%">
          <img src="data:image/png;base64,${logo}" width="200" height="100" alt="CNSS" />
        </div>
        <div style="width: 40%; margin-top: 15px; text-align: center">
          <span style="font-size: 20px; white-space: nowrap">RÉPUBLIQUE DE GUINÉE</span>
          <table style="width: 100%">
            <tr style="width: 100%"><td style="width: 100%">Travail - Justice - Solidarité</td></tr>
            <tr style="width: 100%"><td style="width: 100%">Caisse Nationale de Sécurité Sociale</td></tr>
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
          <img src="data:image/png;base64,${simandou}" width="150" height="150" style="float: right; padding: 5px; position: relative; top: -10px" alt="" />
        </div>
      </div>
    </header>

    <div class="sheet">
      <div class="title-box">
        <h1>DÉCLARATION D'ACCIDENT DU TRAVAIL</h1>
      </div>

      <div class="attention-box">
        <strong>ATTENTION :</strong> L'accident a-t-il entraîné un arrêt de travail ?
        <span class="checkbox"></span> OUI &nbsp;&nbsp;
        <span class="checkbox"></span> NON<br />
        &nbsp;&nbsp;&nbsp;- Si oui, remplissez IMMÉDIATEMENT l'attestation de salaire.<br />
        &nbsp;&nbsp;&nbsp;- Si non, remplissez uniquement cette déclaration.
      </div>

      <div class="form-section">
        <div class="section-bar">EMPLOYEUR</div>

        <div class="field-row">
          <span class="field-label">Nom, Prénoms ou Raison Sociale :</span>
          <span class="field-value">${raisonSociale}</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-label">Adresse :</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-line" style="flex: 2"></span>
          <span class="field-label" style="margin-left: 20px">N° Téléphone :</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row" style="margin-top: 20px">
          <span class="field-label">N° d'Immatriculation de l'Employeur :</span>
          <span class="field-value">${noImmatEmployeur}</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row" style="margin-top: 20px">
          <span class="field-label">Code de Sécurité Sociale (à 2 chiffres)</span>
        </div>
        <div class="field-row">
          <span class="field-label">D'activité professionnelle figurant dans le numéro d'employeur (ci-dessus) - premiers caractères :</span>
          <span class="field-line"></span>
        </div>
      </div>

      <div class="form-section">
        <div class="section-bar">VICTIME</div>

        <div class="field-row">
          <span class="field-label">N° d'Immatriculation :</span>
          <span class="field-value">${noImmatEmploye}</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-half">
            <span class="field-label">À défaut Sexe :</span>
            <span class="field-line"></span>
          </span>
          <span class="field-half">
            <span class="field-label">Date de naissance :</span>
            <span class="field-line"></span>
          </span>
        </div>
        <div class="field-row">
          <span class="field-label">Nom et Prénoms <em>(Suivi s'il y a du nom de l'époux)</em> :</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-half">
            <span class="field-label">Adresse :</span>
            <span class="field-line"></span>
          </span>
          <span class="field-half" style="justify-content: flex-end">
            <span class="field-label">Nationalité : </span>
            <span class="checkbox"></span> Guinéenne
            <span class="checkbox" style="margin-left: 10px"></span> Autre
            <span class="field-line" style="max-width: 60px; margin-left: 4px"></span>
          </span>
        </div>
        <div class="field-row">
          <span class="field-half">
            <span class="field-label">Date d'embauche :</span>
            <span class="field-line"></span>
          </span>
          <span class="field-half">
            <span class="field-label">Profession :</span>
            <span class="field-line"></span>
          </span>
        </div>
        <div class="field-row">
          <span class="field-half">
            <span class="field-label">Qualification professionnelle :</span>
            <span class="field-line"></span>
          </span>
          <span class="field-half">
            <span class="field-label">Ancienneté dans le poste :</span>
            <span class="field-line"></span>
          </span>
        </div>
        <div class="field-row">
          <span class="field-label">L'accident a-t-il fait d'autres victimes ?</span>
          <span class="checkbox"></span> OUI &nbsp;&nbsp;
          <span class="checkbox"></span> NON
        </div>
      </div>

      <div class="accident-section" style="margin-top: 30px">
        <div class="section-bar">ACCIDENT</div>

        <div class="field-row">
          <span class="field-half">
            <span class="field-label">Date :</span>
            <span class="field-line"></span>
          </span>
          <span class="field-half">
            <span class="field-label">Heure :</span>
            <span class="field-line"></span>
          </span>
        </div>
        <div class="field-row">
          <span class="field-label">Horaire de travail de la victime le jour de l'accident de</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-label">À</span>
          <span class="field-line" style="max-width: 150px"></span>
          <span class="field-label" style="margin-left: 20px">et de</span>
          <span class="field-line" style="max-width: 150px"></span>
          <span class="field-label" style="margin-left: 20px">À</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-label">Lieu de l'accident :</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-label">Circonstances détaillées de l'accident :</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-label">(indiqué le cas échéant :</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-label">l'appareil, la machine ou le moyen de locomotion utilisé, impliqué dans l'accident) :</span>
          <span class="field-line"></span>
        </div>

        <div class="spacer"></div>

        <div class="field-row">
          <span class="field-label">Sièges des lésions :</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-label">Nature des lésions :</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-label">Victime transportée à :</span>
          <span class="field-line"></span>
        </div>

        <div class="spacer"></div>

        <div class="accident-block" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px">
          <span class="checkbox"></span>
          <span>Accident constaté le</span>
          <span class="field-line" style="max-width: 150px"></span>
        </div>
        <div class="accident-block" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px">
          <span class="checkbox"></span>
          <span>Connu</span>
          <span class="field-line" style="flex: 1; max-width: 250px"></span>
          <span>Heure :</span>
          <span class="field-line" style="max-width: 150px"></span>
        </div>
        <div class="accident-block" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px">
          <span class="checkbox"></span>
          <span>par l'employeur</span>
          <span class="checkbox" style="margin-left: 20px"></span>
          <span>par ses préposés</span>
          <span class="checkbox" style="margin-left: 20px"></span>
          <span>décrit par la victime</span>
        </div>
        <div class="accident-block" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px">
          <span class="checkbox"></span>
          <span>Inscrit au registre d'infirmerie le</span>
          <span class="field-line" style="flex: 1; max-width: 250px"></span>
          <span>Sous le N° :</span>
          <span class="field-line" style="max-width: 150px"></span>
        </div>

        <div class="conseq-row">
          <strong>Conséquences</strong>
          <span><span class="checkbox"></span> SANS ARRÊT DE TRAVAIL</span>
          <span><span class="checkbox"></span> AVEC ARRÊT DE TRAVAIL</span>
          <span><span class="checkbox"></span> DÉCÈS</span>
        </div>
      </div>

      <div class="temoins-tiers-section">
        <div class="section-bar">TÉMOINS</div>

        <div class="field-row">
          <span class="field-label">Nom et Prénoms :</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-label">Adresse :</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-label">Un rapport de police a-t-il été établi ?</span>
          <span class="checkbox"></span> OUI &nbsp;&nbsp;
          <span class="checkbox"></span> NON
        </div>
        <div class="field-row">
          <span class="field-label">Par qui :</span>
          <span class="field-line"></span>
        </div>

        <div class="section-bar">TIERS</div>

        <div class="field-row">
          <span class="field-label">L'accident a-t-il été causé par un tiers ?</span>
          <span class="checkbox"></span> OUI &nbsp;&nbsp;
          <span class="checkbox"></span> NON
        </div>
        <div class="field-row">
          <span class="field-label">Si OUI, Nom et Adresse du tiers :</span>
          <span class="field-line"></span>
        </div>
        <div class="field-row">
          <span class="field-label">Ste d'Assurance du tiers :</span>
          <span class="field-line"></span>
        </div>
      </div>

      <div class="engagement-box">
        <div class="section-bar">ENGAGEMENT SUR L'HONNEUR</div>

        <div class="accident-block" style="text-align: justify">
          Je soussigné(e)
          <span class="field-line" style="display: inline-block; width: 300px; margin: 0 8px"></span>
          en ma qualité d'employeur, certifie sur l'honneur que les informations portées dans la présente
          déclaration d'accident du travail sont sincères et conformes à la réalité. Je m'engage à informer
          immédiatement la Caisse Nationale de Sécurité Sociale de tout changement ou élément nouveau
          concernant cet accident.
        </div>

        <div class="field-row" style="margin-top: 20px">
          <span class="field-label">Fait à :</span>
          <span class="field-line" style="max-width: 200px"></span>
          <span class="field-label" style="margin-left: 20px">le</span>
          <span class="field-line" style="max-width: 30px"></span>
          /
          <span class="field-line" style="max-width: 30px"></span>
          / 20
          <span class="field-line" style="max-width: 30px"></span>
        </div>
        <div class="field-row" style="margin-bottom: 0">
          <span class="field-half">
            <span class="field-label">Qualité :</span>
            <span class="field-line"></span>
          </span>
          <span class="field-half">
            <span class="field-label">Signature :</span>
            <span class="field-line"></span>
          </span>
        </div>
      </div>

      <div class="warning-box">
        <div class="subtitle">(Application du Code de la Sécurité Sociale)</div>
        <div class="instructions">
          L'EMPLOYEUR ENVOIE À LA CAISSE NATIONALE DE SÉCURITÉ SOCIALE 2 EXEMPLAIRES DE LA DÉCLARATION<br />
          D'ACCIDENT DU TRAVAIL AU PLUS TARD 48 HEURES APRÈS AVOIR PRIS CONNAISSANCE DE L'ACCIDENT, ET<br />
          CONSERVE LE 3ème EXEMPLAIRE
        </div>
      </div>
    </div>

    <footer>
      <div style="text-align: center; font-size: 12px; width: 100%">
        <span style="text-align: center; font-weight: bold">République de Guinée</span>
        <br />
        <span style="text-align: center">Caisse Nationale de sécurité Sociale, Kouléwondy - Kaloum BP 138</span>
        <br />
        <span>République de Guinée | www.cnss.gov.gn</span>
      </div>
    </footer>
  </body>
</html>`;

  const executablePath = resolveChromeExecutable();
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--no-first-run',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
  ];
  const launchOpts = { headless: 'new', args: launchArgs };
  if (executablePath) launchOpts.executablePath = executablePath;

  let browser;
  try {
    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.emulateMediaType('print');
    const pdfPath = path.join(DOCS_DIR, `${name}.pdf`);
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    fs.writeFileSync(pdfPath, pdfBuffer);
    return { pdfPath, buffer: pdfBuffer };
  } catch (err) {
    console.error('[accident_travail/pdf] generateAccidentTravailModel:', err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = { generateAccidentTravailModel };
