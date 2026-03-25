/**
 * documentGenerator.js
 * Génère les PDFs à la volée selon le type de document (code/name)
 * Retourne un Buffer binaire du PDF
 */

const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const { Op } = require('sequelize');

/** Même liste d'arguments que getFileAppelCotisation (utility.js) */
const PUPPETEER_LAUNCH_ARGS = [
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
  '--no-default-browser-check'
];

/**
 * Résout le binaire Chrome local (chrome/) – même approche que utility.js getFileAppelCotisation.
 * Utiliser un Chrome local améliore la stabilité et évite les "socket hang up".
 */
function resolveChromeExecutable() {
  const chromeDir = path.join(path.resolve(__dirname, '../..'), 'chrome');
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
    console.warn('[documentGenerator] Chrome local non trouvé:', err.message);
  }
  return null;
}

function getPuppeteerLaunchOptions() {
  const opts = { headless: 'new', args: PUPPETEER_LAUNCH_ARGS, timeout: 30000, protocolTimeout: 60000 };
  const executablePath = resolveChromeExecutable();
  if (executablePath) opts.executablePath = executablePath;
  return opts;
}

function isRetryableError(err) {
  const msg = (err && err.message) ? String(err.message) : '';
  const code = err && err.code;
  return code === 'ECONNRESET' || code === 'ECONNREFUSED' || /socket hang up|Target closed|Protocol error/i.test(msg);
}

/**
 * Lance le navigateur, exécute la fonction avec la page, puis ferme le navigateur.
 * En cas d'erreur "socket hang up" / ECONNRESET, réessaie une fois.
 */
async function withBrowser(fn, maxRetries = 2) {
  const launchOpts = getPuppeteerLaunchOptions();
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let browser;
    try {
      browser = await puppeteer.launch(launchOpts);
      const page = await browser.newPage();
      const result = await fn(page, browser);
      await browser.close().catch(() => {});
      return result;
    } catch (err) {
      lastErr = err;
      if (browser) {
        await browser.close().catch(() => {});
      }
      if (attempt < maxRetries && isRetryableError(err)) {
        console.warn(`[documentGenerator] Tentative ${attempt} échouée (${err.message}), nouvel essai...`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const ROOT_DIR = path.resolve(__dirname, '../..');
const IMAGE_PATHS = {
  logo: path.join(ROOT_DIR, 'CNSS.jpg'),
  signature: path.join(ROOT_DIR, 'signature.jpg'),
  branding: path.join(ROOT_DIR, 'db/document/branding.png'),
  simandou: path.join(ROOT_DIR, 'simandou.jpeg'),
  bqrcode: path.join(ROOT_DIR, 'bqrcode.avif')
};

// Import des modèles nécessaires
const CotisationEmployeur = require('../cotisation_employeur/model');
const Paiement = require('../paiement/model');
const Quittance = require('../quittance/model');
const { genereQuittance } = require('../../utility2');
const { getFileAppelCotisation } = require('../../utility');
const { genereListePdf, generelistDeclaration } = require('../../utility3');

/**
 * Charge une image en base64 ou retourne une chaîne vide si fichier absent
 */
function readImageBase64(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath).toString('base64');
    }
  } catch (err) {
    console.warn(`[documentGenerator] Image non trouvée: ${filePath}`, err.message);
  }
  return '';
}

/**
 * Génère un code QR
 */
async function generateQRCode() {
  try {
    return await QRCode.toDataURL('https://e.cnss.gov.gn/#/', { 
      width: 100, 
      color: { dark: '#000000', light: '#ffffff' } 
    });
  } catch (err) {
    console.warn('[documentGenerator] QRCode non généré:', err.message);
    return '';
  }
}

/**
 * Détecte le type de document depuis le nom
 */
function detectDocumentType(document) {
  const name = (document.name || '').toLowerCase();
  const code = (document.code || '').toLowerCase();

  // Détection par nom
  if (name.includes('facture')) {
    return 'facture';
  }
  if (name.includes('quittance')) {
    return 'quittance';
  }
  if (name.includes('notification') && name.includes('immatriculation')) {
    return 'notification';
  }
  if (name.includes('récépissé') || name.includes('recepisse') || name.includes('recépissé')) {
    return 'recepisse';
  }
  if (name.includes('attestation')) {
    return 'attestation';
  }
  if (name.includes('declaration') || name.includes('déclaration')) {
    return 'declaration';
  }
  if (name.includes('certificat')) {
    return 'certificat';
  }
  if (name.includes('liste')) {
    return 'liste';
  }

  // Détection par code (si le code est un type de document)
  if (['facture', 'quittance', 'attestation', 'declaration', 'certificat', 'liste', 'notification', 'recepisse'].includes(code)) {
    return code;
  }

  // Par défaut, essayer de détecter depuis le code (ancien système avec code unique)
  // Si le code est un code unique (9 chiffres), on essaie de trouver le type depuis le nom
  return 'facture'; // Par défaut
}

/**
 * Génère le buffer PDF pour un document de type facture (appel de cotisations).
 * Délègue à getFileAppelCotisation (utility.js) pour utiliser exactement le même flux que l'appel de cotisation.
 */
async function generateFactureBuffer(document, employeur) {
  const nameMatch = document.name.match(/Facture(?:\s+complémentaire)?[-\s]+([^-]+)-(\d{4})/i);
  if (!nameMatch) {
    throw new Error('Impossible de déterminer la période et l\'année depuis le nom du document');
  }

  const periode = nameMatch[1].trim();
  const year = parseInt(nameMatch[2], 10);

  const cotisation = await CotisationEmployeur.findOne({
    where: {
      employeurId: document.employeurId,
      year: year,
      [Op.or]: [
        { periode: periode },
        { trimestre: periode }
      ]
    },
    include: [
      {
        model: require('../XYemployeurs/model'),
        as: 'employeur'
      }
    ]
  });

  if (!cotisation) {
    throw new Error(`Cotisation non trouvée pour la période ${periode} ${year}`);
  }

  const employeurRecord = employeur || cotisation.employeur || {};
  const cotisationPlain = cotisation.get ? cotisation.get({ plain: true }) : cotisation;
  const factureName = (document.name || 'facture').replace(/\.pdf$/i, '');
  const code = document.code || '';

  const result = await getFileAppelCotisation(factureName, cotisationPlain, 'FACTURE', employeurRecord, code);
  if (result && result.buffer) {
    return Buffer.isBuffer(result.buffer) ? result.buffer : Buffer.from(result.buffer);
  }
  throw new Error('getFileAppelCotisation n\'a pas renvoyé de buffer');
}

/**
 * Génère le buffer PDF pour un document de type quittance
 */
async function generateQuittanceBuffer(document, employeur) {
  // Extraire la période depuis le nom du document
  // Format attendu: "Quittance-PERIODE"
  const nameMatch = document.name.match(/Quittance[-\s]+(.+)/i);
  if (!nameMatch) {
    throw new Error('Impossible de déterminer la période depuis le nom du document');
  }

  const periode = nameMatch[1].trim();

  // Trouver le paiement et la quittance correspondants
  // On cherche la quittance la plus récente pour cet employeur
  const quittance = await Quittance.findOne({
    where: { employeurId: document.employeurId },
    include: [
      {
        model: Paiement,
        as: 'paiement',
        required: true,
        include: [
          {
            model: CotisationEmployeur,
            as: 'cotisation_employeur',
            required: true
          },
          {
            model: require('../XYemployeurs/model'),
            as: 'employeur',
            required: true
          }
        ]
      }
    ],
    order: [['createdAt', 'DESC']]
  });

  if (!quittance || !quittance.paiement) {
    throw new Error('Quittance ou paiement non trouvé');
  }

  const paiement = quittance.paiement;
  const cotisation = paiement.cotisation_employeur;
  const emp = employeur || paiement.employeur || {};

  // Générer le PDF en utilisant la fonction existante mais en retournant un buffer
  // Pour l'instant, on génère un PDF simple
  // TODO: Utiliser la fonction genereQuittance existante mais adapter pour retourner un buffer

  const logo = readImageBase64(IMAGE_PATHS.logo);
  const signature = readImageBase64(IMAGE_PATHS.simandou); // Utiliser simandou comme signature temporaire
  const simandou = readImageBase64(IMAGE_PATHS.simandou);
  const codeQR = await generateQRCode();
  const code = document.code || '';

  const Cot = cotisation || {};
  const totalBranche = Cot.total_branche != null ? Number(Cot.total_branche).toLocaleString('en-US') : '0';
  const finEcheance = Cot.fin_echeance_principal ? new Date(Cot.fin_echeance_principal).toLocaleString('fr-FR') : '--';

  const quittanceHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Quittance</title>
    <style>@page{margin:0} body{margin:2cm;font-family:'Poppins',sans-serif} header{position:fixed;top:0;left:0;right:0;height:4cm} main{position:relative;top:80px} footer{position:fixed;bottom:0;left:0;right:0;height:2cm}</style></head><body>
    <header><div style="display:flex"><div style="width:35%"><img src="data:image/png;base64,${logo}" width="200" height="100"></div>
    <div style="width:40%;margin-top:15px;text-align:center"><span style="font-size:20px">RÉPUBLIQUE DE GUINÉE</span><table style="width:100%"><tr><td>Travail - Justice - Solidarité</td></tr><tr><td>Caisse Nationale de Sécurité Sociale</td></tr></table>
    <table style="width:100%"><tr><td style="background:red;width:15%;height:2px"></td><td style="background:yellow;width:15%"></td><td style="background:green;width:15%"></td></tr></table></div>
    <div style="width:35%"><img src="data:image/png;base64,${simandou}" width="150" height="150" style="float:right;padding:5px"></div></div></header>
    <main style="font-size:14px"><div style="width:70%;margin:auto;font-size:10px;text-align:center;padding:2px;margin-top:30px;background:rgb(108,216,108)"><h1>QUITTANCE COTISATIONS</h1></div>
    <table style="margin-top:15px"><tbody>
    <tr><td style="width:25%;padding-bottom:10px">N° QUITTANCE:</td><td>${emp.no_immatriculation || ''}${periode}</td></tr>
    <tr><td style="padding-bottom:10px">RAISON SOCIALE:</td><td>${emp.raison_sociale || ''}</td></tr>
    <tr><td style="padding-bottom:10px">ADRESSE:</td><td>${emp.adresse || ''}</td></tr>
    <tr><td style="padding-bottom:10px">N°EMPLOYEUR:</td><td>${emp.no_immatriculation || ''}</td></tr>
    <tr><td style="padding-bottom:10px">CATEGORIE:</td><td>${emp.category || ''}</td></tr>
    <tr><td style="padding-bottom:10px">SALARIÉS:</td><td>${Cot.current_effectif ?? ''}</td></tr>
    </tbody></table>
    <div style="display:flex"><div style="width:35%"><span>EMAIL:</span></div><div style="width:35%">${emp.email || ''}</div><div style="width:35%">TÉLÉPHONE:</div><div style="width:35%">+224 ${emp.phone_number || ''}</div></div>
    <hr/><table style="width:100%"><tbody>
    <tr><td style="padding-bottom:10px">MONTANT À PAYER</td><td style="text-align:right">${totalBranche} GNF</td></tr>
    <tr><td style="padding-bottom:10px">PAIEMENT SUR</td><td style="text-align:right">${Cot.motif || ''}</td></tr>
    <tr><td style="padding-bottom:10px">MONTANT PAYÉ</td><td style="text-align:right">${totalBranche} GNF</td></tr>
    <tr><td style="padding-bottom:10px">RESTE À PAYER</td><td style="text-align:right">0 GNF</td></tr>
    <tr><td style="padding-bottom:10px">DATE DE PAIEMENT</td><td style="text-align:right">${paiement.paiement_date ? new Date(paiement.paiement_date).toLocaleDateString('fr-FR') : '--'}</td></tr>
    <tr><td style="padding-bottom:10px">PERIODE DE PAIEMENT</td><td style="text-align:right">${periode}</td></tr>
    <tr><td style="padding-bottom:10px">DATE LIMITE PAIEMENT</td><td style="text-align:right">${finEcheance}</td></tr>
    <tr><td style="padding-bottom:10px">MODE DE PAIEMENT</td><td style="text-align:right">VIREMENT</td></tr>
    <tr><td style="padding-bottom:10px">BANQUE</td><td style="text-align:right">${paiement.bank_name || ''}</td></tr>
    <tr><td style="padding-bottom:10px">MAJORATION DUE</td><td style="text-align:right">0 GNF</td></tr>
    </tbody></table>
    <div style="display:flex"><div style="text-align:left;width:75%"><img src="${codeQR}" alt="QR"/><p><strong>CODE:${code}</strong></p></div>
    <div style="text-align:right"><p>${new Date().toLocaleString('fr-FR')}</p><p>Le Directeur Général</p><img src="data:image/png;base64,${signature}" width="200" height="100"/><p><strong>M. Bakary Sylla</strong></p></div></div>
    </main>
    <footer><div style="text-align:center;font-size:12px;width:100%"><span style="font-weight:bold">République de Guinée</span><br/><span>Caisse Nationale de sécurité Sociale, Kouléwondy - Kaloum BP 138</span><br/><span>République de Guinée | www.ecnss.gov.gn | Tel: 625565616</span></div></footer>
    </body></html>`;

  return withBrowser(async (page) => {
    await page.setContent(quittanceHtml, { waitUntil: 'load', timeout: 30000 });
    await page.emulateMediaType('screen');
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdfBuffer);
  }).catch((err) => {
    console.error('[documentGenerator] Erreur génération quittance:', err.message);
    throw err;
  });
}

/**
 * Génère le buffer PDF pour un document de type notification d'immatriculation
 */
async function generateNotificationBuffer(document, employeur) {
  const emp = employeur || document.employeur || {};
  const code = document.code || '';

  const logo = readImageBase64(IMAGE_PATHS.logo);
  const simandou = readImageBase64(IMAGE_PATHS.simandou);
  const codeQR = await generateQRCode();

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
  <div style="display:flex"><div style="text-align:left;margin-top:23px;width:80%">${codeQR ? `<img src="${codeQR}" alt="QR"/>` : ''}<p><strong>CODE: ${code || ''}</strong></p></div><p style="text-align:right;margin-top:23px">Conakry ${new Date().toLocaleDateString('fr')}.<br/>POUR LE DIRECTEUR GÉNÉRAL LE DÉLÉGUÉ</p></div>
  </main>
  <footer><div style="text-align:center;font-size:12px;width:100%"><span style="font-weight:bold">République de Guinée</span><br/><span>Caisse Nationale de sécurité Sociale, Kouléwondy - Kaloum BP 138</span><br/><span>République de Guinée | www.cnss.gov.gn</span></div></footer></body></html>`;

  return withBrowser(async (page) => {
    await page.setContent(notifHtml, { waitUntil: 'load', timeout: 30000 });
    await page.emulateMediaType('screen');
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdfBuffer);
  }).catch((err) => {
    console.error('[documentGenerator] Erreur génération notification:', err.message);
    throw err;
  });
}

/**
 * Génère le buffer PDF pour un document de type récépissé
 */
async function generateRecepisseBuffer(document, employeur) {
  const emp = employeur || document.employeur || {};

  // Extraire la référence depuis le nom du document
  // Format attendu: "récépissé N° 64" ou "récépissé N°64"
  const nameMatch = document.name.match(/récépissé\s*N°\s*(\d+)/i) || 
                   document.name.match(/recepisse\s*N°\s*(\d+)/i) ||
                   document.name.match(/recépissé\s*N°\s*(\d+)/i);
  
  let reference = '';
  let demandeId = null;
  
  if (nameMatch) {
    demandeId = parseInt(nameMatch[1], 10);
    // Récupérer la demande pour obtenir la référence
    const Demande = require('../demandes/model');
    const demande = await Demande.findByPk(demandeId, {
      include: [
        {
          model: require('../XYemployeurs/model'),
          as: 'employeur'
        }
      ]
    });
    
    if (demande && demande.reference) {
      reference = demande.reference;
    } else {
      // Si pas de référence, utiliser l'ID de la demande
      reference = `REF-${demandeId}`;
    }
    
    // Utiliser l'employeur de la demande si disponible
    if (demande && demande.employeur) {
      Object.assign(emp, demande.employeur);
    }
  } else {
    // Si on ne peut pas extraire l'ID, utiliser le code du document comme référence
    reference = document.code || `REF-${document.id}`;
  }

  const logo = readImageBase64(IMAGE_PATHS.logo);
  const branding = readImageBase64(IMAGE_PATHS.branding);
  const signature = readImageBase64(IMAGE_PATHS.signature);

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Récépissé Quitus</title>
    <style>@page{margin:0} body{margin:2cm;font-family:'Poppins',sans-serif} header{position:fixed;top:0;left:0;right:0;height:4cm} main{top:80px;position:relative} footer{position:fixed;bottom:0;left:0;right:0;height:2cm}</style></head><body>
    <header><div style="display:flex"><div style="width:35%"><img src="data:image/png;base64,${logo}" width="200" height="100"/></div>
    <div style="width:40%;margin-top:15px;text-align:center"><span style="font-size:20px">RÉPUBLIQUE DE GUINÉE</span><table style="width:100%"><tr><td>Travail - Justice - Solidarité</td></tr><tr><td>Caisse Nationale de Sécurité Sociale</td></tr></table>
    <table style="width:100%"><tr><td style="background:red;width:15%;height:2px"></td><td style="background:yellow;width:15%"></td><td style="background:green;width:15%"></td></tr></table></div>
    <div style="width:35%"><img src="data:image/png;base64,${branding}" width="100" height="50" style="float:right;padding:10px"/></div></div></header>
    <main style="font-size:14px"><div style="width:50%;margin:auto;text-align:center;margin-top:30px;background:rgb(108,216,108)"><h1>RÉCÉPISSÉ QUITUS</h1></div>
    <table style="width:100%;margin-top:30px"><tr><td>Date:</td><td>${new Date().toLocaleDateString('fr-FR')}</td><td style="text-align:right">${reference}</td></tr></table>
    <table style="width:100%;margin-top:30px;border:1px solid #cdd2cd"><tr><td style="text-align:center;padding:10px;background:#cdd2cd">Raison Sociale<br/>${emp.raison_sociale ?? ''}</td><td style="text-align:center;padding:10px;background:#cdd2cd">N° Entreprise<br/>${emp.no_immatriculation ?? ''}</td></tr>
    <tr><td style="padding:10px">E-mail</td><td>${emp.email ?? ''}</td></tr><tr><td style="padding:10px">Adresse</td><td>${emp.adresse ?? ''}</td></tr><tr><td style="padding:10px">Téléphone</td><td>+224 ${emp.phone_number ?? ''}</td></tr></table>
    <p>NB: Conservez ce récépissé pour la récupération du quitus.</p>
    <div style="text-align:right;margin-top:60px"><p>Le Directeur Général</p><img src="data:image/png;base64,${signature}" width="200" height="100"/><p><strong>M. Bakary Sylla</strong></p></div>
    </main>
    <footer><div style="text-align:center;font-size:12px;width:100%"><span style="font-weight:bold">République de Guinée</span><br/><span>Caisse Nationale de sécurité Sociale, Kouléwondy - Kaloum BP 138</span></div></footer>
    </body></html>`;

  return withBrowser(async (page) => {
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.emulateMediaType('screen');
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdfBuffer);
  }).catch((err) => {
    console.error('[documentGenerator] Erreur génération récépissé:', err.message);
    throw err;
  });
}

/**
 * Fonction principale : génère le buffer PDF selon le type de document
 */
async function generateDocumentBuffer(document) {
  const documentType = detectDocumentType(document);
  const employeur = document.employeur || null;

  switch (documentType) {
    case 'facture':
      return await generateFactureBuffer(document, employeur);
    
    case 'quittance':
      return await generateQuittanceBuffer(document, employeur);
    
    case 'notification':
      return await generateNotificationBuffer(document, employeur);
    
    case 'recepisse':
      return await generateRecepisseBuffer(document, employeur);
    
    case 'attestation':
      // TODO: Implémenter la génération d'attestation
      throw new Error('Génération d\'attestation non implémentée');
    
    case 'declaration':
      // TODO: Implémenter la génération de déclaration
      throw new Error('Génération de déclaration non implémentée');
    
    case 'certificat':
      // TODO: Implémenter la génération de certificat
      throw new Error('Génération de certificat non implémentée');
    
    case 'liste':
      // TODO: Implémenter la génération de liste
      throw new Error('Génération de liste non implémentée');
    
    default:
      throw new Error(`Type de document non supporté: ${documentType}`);
  }
}

module.exports = {
  generateDocumentBuffer
};
