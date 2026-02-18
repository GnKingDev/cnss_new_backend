/**
 * utility2.js – PDF (quittance, quitus, récépissé), Excel, mail, OTP, SMS
 * À la racine du projet. Utilisé par db/adhesion, db/cotisation_employeur, db/paiement, db/demandes, db/users, etc.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname);
const DOCS_DIR = path.join(ROOT_DIR, 'document/docs');

const IMAGE_PATHS = {
  logo: path.join(ROOT_DIR, 'CNSS.jpg'),
  branding: path.join(ROOT_DIR, 'db/document/branding.png'),
  signature: path.join(ROOT_DIR, 'signature.jpg'),
  simandou: path.join(ROOT_DIR, 'simandou.jpeg'),
  bqrcode: path.join(ROOT_DIR, 'bqrcode.avif')
};

const SECRET_FILE = path.join(ROOT_DIR, 'secret.json');

let transporter, user_email_name, appendTextToFile, excel;
try {
  const mailConfig = require('./teste.mail');
  transporter = mailConfig.transporter;
  user_email_name = mailConfig.user_email_name || process.env.SMTP_USER || 'noreply@cnss.gov.gn';
} catch {
  transporter = null;
  user_email_name = process.env.SMTP_USER || 'noreply@cnss.gov.gn';
}
try {
  appendTextToFile = require('./save.error_log').appendTextToFile || (() => {});
} catch {
  appendTextToFile = () => {};
}
try {
  excel = require('node-excel-export');
} catch {
  excel = null;
}

function readImageBase64(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath).toString('base64');
  } catch (err) {
    console.warn('[utility2] Image non trouvée:', filePath);
  }
  return '';
}

function ensureDocsDir() {
  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
}

// ---------- QR Code ----------
function textQrcCode() {
  try {
    const QRCode = require('qrcode');
    return QRCode.toDataURL('https://e.cnss.gov.gn/#/auth_doc_reference', {
      margin: 4,
      color: { dark: '#000000', light: '#ffffff' }
    });
  } catch (err) {
    return Promise.resolve('');
  }
}

// ---------- Quittance PDF ----------
async function genereQuittance(paiement, period, fileName, code, periode, type, bank_name) {
  let browser;
  try {
    const puppeteer = require('puppeteer');
    const logo = readImageBase64(IMAGE_PATHS.logo);
    const signature = readImageBase64(IMAGE_PATHS.signature);
    const simandou = readImageBase64(IMAGE_PATHS.simandou);
    const codeQR = await textQrcCode();

    const Emp = paiement.Employeur || paiement.employeur || {};
    const Cot = paiement.cotisation_employeur || paiement.cotisationEmployeur || {};
    const totalBranche = Cot.total_branche != null ? Number(Cot.total_branche).toLocaleString('en-US') : '0';
    const finEcheance = Cot.fin_echeance_principal ? new Date(Cot.fin_echeance_principal).toLocaleString('fr-FR') : '--';

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Quittance</title>
    <style>@page{margin:0} body{margin:2cm;font-family:'Poppins',sans-serif} header{position:fixed;top:0;left:0;right:0;height:4cm} main{position:relative;top:80px} footer{position:fixed;bottom:0;left:0;right:0;height:2cm}</style></head><body>
    <header><div style="display:flex"><div style="width:35%"><img src="data:image/png;base64,${logo}" width="200" height="100"></div>
    <div style="width:40%;margin-top:15px;text-align:center"><span style="font-size:20px">RÉPUBLIQUE DE GUINÉE</span><table style="width:100%"><tr><td>Travail - Justice - Solidarité</td></tr><tr><td>Caisse Nationale de Sécurité Sociale</td></tr></table>
    <table style="width:100%"><tr><td style="background:red;width:15%;height:2px"></td><td style="background:yellow;width:15%"></td><td style="background:green;width:15%"></td></tr></table></div>
    <div style="width:35%"><img src="data:image/png;base64,${simandou}" width="150" height="150" style="float:right;padding:5px"></div></div></header>
    <main style="font-size:14px"><div style="width:70%;margin:auto;font-size:10px;text-align:center;padding:2px;margin-top:30px;background:rgb(108,216,108)"><h1>QUITTANCE COTISATIONS</h1></div>
    <table style="margin-top:15px"><tbody>
    <tr><td style="width:25%;padding-bottom:10px">N° QUITTANCE:</td><td>${Emp.no_immatriculation || ''}${period}${type}</td></tr>
    <tr><td style="padding-bottom:10px">RAISON SOCIALE:</td><td>${Emp.raison_sociale || ''}</td></tr>
    <tr><td style="padding-bottom:10px">ADRESSE:</td><td>${Emp.adresse || ''}</td></tr>
    <tr><td style="padding-bottom:10px">N°EMPLOYEUR:</td><td>${Emp.no_immatriculation || ''}</td></tr>
    <tr><td style="padding-bottom:10px">CATEGORIE:</td><td>${Emp.category || ''}</td></tr>
    <tr><td style="padding-bottom:10px">SALARIÉS:</td><td>${Cot.current_effectif ?? ''}</td></tr>
    </tbody></table>
    <div style="display:flex"><div style="width:35%"><span>EMAIL:</span></div><div style="width:35%">${Emp.email || ''}</div><div style="width:35%">TÉLÉPHONE:</div><div style="width:35%">+224 ${Emp.phone_number || ''}</div></div>
    <hr/><table style="width:100%"><tbody>
    <tr><td style="padding-bottom:10px">MONTANT À PAYER</td><td style="text-align:right">${totalBranche} GNF</td></tr>
    <tr><td style="padding-bottom:10px">PAIEMENT SUR</td><td style="text-align:right">${Cot.motif || ''}</td></tr>
    <tr><td style="padding-bottom:10px">MONTANT PAYÉ</td><td style="text-align:right">${totalBranche} GNF</td></tr>
    <tr><td style="padding-bottom:10px">RESTE À PAYER</td><td style="text-align:right">0 GNF</td></tr>
    <tr><td style="padding-bottom:10px">DATE DE PAIEMENT</td><td style="text-align:right">${paiement.paiement_date ? new Date(paiement.paiement_date).toLocaleDateString('fr-FR') : '--'}</td></tr>
    <tr><td style="padding-bottom:10px">PERIODE DE PAIEMENT</td><td style="text-align:right">${periode}</td></tr>
    <tr><td style="padding-bottom:10px">DATE LIMITE PAIEMENT</td><td style="text-align:right">${finEcheance}</td></tr>
    <tr><td style="padding-bottom:10px">MODE DE PAIEMENT</td><td style="text-align:right">VIREMENT</td></tr>
    <tr><td style="padding-bottom:10px">BANQUE</td><td style="text-align:right">${bank_name || ''}</td></tr>
    <tr><td style="padding-bottom:10px">MAJORATION DUE</td><td style="text-align:right">0 GNF</td></tr>
    </tbody></table>
    <div style="display:flex"><div style="text-align:left;width:75%"><img src="${codeQR}" alt="QR"/><p><strong>CODE:${code}</strong></p></div>
    <div style="text-align:right"><p>${new Date().toLocaleString('fr-FR')}</p><p>Le Directeur Général</p><img src="data:image/png;base64,${signature}" width="200" height="100"/><p><strong>M. Bakary Sylla</strong></p></div></div>
    </main>
    <footer><div style="text-align:center;font-size:12px;width:100%"><span style="font-weight:bold">République de Guinée</span><br/><span>Caisse Nationale de sécurité Sociale, Kouléwondy - Kaloum BP 138</span><br/><span>République de Guinée | www.ecnss.gov.gn | Tel: 625565616</span></div></footer>
    </body></html>`;

    ensureDocsDir();
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    await page.pdf({
      path: path.join(DOCS_DIR, `${fileName}.pdf`),
      format: 'A4',
      printBackground: true
    });
    return 'ok';
  } catch (error) {
    console.error(error);
    appendTextToFile(error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

// ---------- Mail ----------
async function sendMailSuccesfulPaiement(cotisation, periode, filePath) {
  if (!transporter) return;
  try {
    const pdfPath = path.join(DOCS_DIR, `${filePath}.pdf`);
    const pdfAttachment = fs.existsSync(pdfPath) ? fs.readFileSync(pdfPath) : null;
    const Emp = cotisation.Employeur || cotisation.employeur || {};
    const mailOpts = {
      from: `"Notification CNSS" <${user_email_name}>`,
      to: Emp.email,
      subject: 'Notification de Paiement',
      html: `<p>Bonjour,</p><p><strong>${Emp.raison_sociale}</strong>,</p><p>Nous vous informons que votre paiement pour la période <strong>${periode}</strong> a été effectué avec succès.</p><p>Vous trouverez ci-joint votre quittance.</p>`,
      attachments: pdfAttachment ? [{ filename: 'quittance.pdf', content: pdfAttachment }] : []
    };
    await transporter.sendMail(mailOpts);
  } catch (err) {
    console.error(err);
  }
}

async function sendOptByMail(otp, email) {
  if (!transporter || !email) return;
  try {
    await transporter.sendMail({
      from: `"Notification CNSS" <${user_email_name}>`,
      to: email,
      subject: 'Confirmation par OTP',
      html: `<p>Bonjour,</p><p>Votre code de validation est : <strong>${otp}</strong></p>`
    });
  } catch (err) {
    console.error(err);
  }
}

async function sendMailAdhesion(adhesion, password) {
  if (!transporter || !adhesion?.email) return;
  try {
    await transporter.sendMail({
      from: `"Notification CNSS" <${user_email_name}>`,
      to: adhesion.email,
      subject: "Création de compte employeur",
      html: `<p>Bonjour M./Mme <strong>${adhesion.first_name ?? ''} ${adhesion.last_name ?? ''}</strong>,</p>
<p>Nous avons le plaisir de vous informer de la création du compte de votre entreprise <strong>${adhesion.raison_sociale ?? ''}</strong>.</p>
<p>Numéro d'identification : <strong>${adhesion.no_immatriculation ?? ''}</strong><br/>Mot de passe : <strong>${password}</strong></p>
<p><a href="https://compte.ecnss.gov.gn">Cliquez pour continuer</a></p>
<p style="color:red">NB : Ne partagez ce mot de passe avec personne.</p>`
    });
  } catch (err) {
    console.error(err);
  }
}

async function CreateUserMail(user, Employeur, password) {
  if (!transporter || !user?.email) return;
  try {
    let typeLabel = user.type || '';
    if (typeLabel === 'RH-imma') typeLabel = "RH, pour l'immatriculation de vos employés";
    else if (typeLabel === 'RH-decla') typeLabel = "RH, pour la déclaration de vos employés";
    else if (typeLabel === 'RH') typeLabel = "RH, pour la déclaration et l'immatriculation de vos employés";
    await transporter.sendMail({
      from: `"Notification CNSS" <${user_email_name}>`,
      to: user.email,
      subject: "Création d'utilisateur",
      html: `<p>Bonjour <strong>${user.full_name ?? ''}</strong>,</p><p>L'entreprise <strong>${Employeur?.raison_sociale ?? ''}</strong> vous a ajouté en tant que <strong>${typeLabel}</strong>.</p><p>N° d'identification : ${user.identity ?? ''}</p><p>Mot de passe : ${password}</p><p>Nous vous conseillons de modifier votre mot de passe à la première connexion.</p>`
    });
  } catch (err) {
    console.error(err);
  }
}

async function SendDemandeMail(user, demande) {
  if (!transporter || !user?.email) return;
  try {
    await transporter.sendMail({
      from: `"Notification CNSS" <${user_email_name}>`,
      to: user.email,
      subject: 'Réponse à votre demande',
      html: `<p>Bonjour <strong>${user.full_name ?? ''}</strong>,</p><p>Vous avez reçu une réponse concernant votre demande N° <strong>${demande?.id ?? ''}</strong>.</p><p>Connectez-vous à votre compte pour consulter les détails.</p>`
    });
  } catch (err) {
    console.error(err);
  }
}

/** Envoi email de validation employé (création de compte par l'employeur). */
async function sendValidateMailEmploye(to, employe, employeur, password) {
  if (!transporter || !to) return;
  const emp = employe || {};
  const empeur = employeur || {};
  const logoUrl = 'https://firebasestorage.googleapis.com/v0/b/guicart-1581b.appspot.com/o/restoImg%2FCNSS.jpg?alt=media&token=bc7160b0-c2aa-4e1c-afe5-4d1d590dd52f';
  try {
    await transporter.sendMail({
      from: `"Notification CNSS" <${user_email_name}>`,
      to,
      subject: 'Notification de Validation',
      html: `<img src="${logoUrl}" width="500" height="200" alt="CNSS" />
        <p>Bonjour Mr/Mme <strong>${emp.first_name ?? ''} ${emp.last_name ?? ''}</strong>,</p>
        <p>L'entreprise: <strong>${empeur.raison_sociale ?? ''}</strong> a créé votre compte employé à la CNSS.</p>
        <p>Veuillez voir ci-dessous votre login pour accéder à votre espace assuré.</p>
        <p><strong>N° identification: ${emp.no_immatriculation ?? ''}</strong><br/><strong>MOT DE PASSE: ${password ?? ''}</strong></p>
        <p><a class="btn btn-success btn-lg" href="https://compte.cnss.gov.gn">Cliquez pour l'activer</a></p>
        <p style="color: red;">NB: Veuillez ne pas partager ces informations.</p>`
    });
  } catch (err) {
    console.error('[utility2] sendValidateMailEmploye:', err.message);
  }
}

/** Envoi email délégation compte payeur. */
async function sendComptePayeurMail(employe) {
  if (!transporter) return;
  const emp = employe || {};
  const raisonSociale = emp.Employeur?.raison_sociale ?? emp.employeur?.raison_sociale ?? '';
  const to = emp.email;
  if (!to) return;
  const logoUrl = 'https://firebasestorage.googleapis.com/v0/b/guicart-1581b.appspot.com/o/restoImg%2FCNSS.jpg?alt=media&token=bc7160b0-c2aa-4e1c-afe5-4d1d590dd52f';
  try {
    await transporter.sendMail({
      from: `"Notification CNSS" <${user_email_name}>`,
      to,
      subject: 'Délégation du compte payeur',
      html: `<img src="${logoUrl}" width="500" height="200" alt="CNSS" />
        <p>Bonjour Mr/Mme <strong>${emp.first_name ?? ''} ${emp.last_name ?? ''}</strong>,</p>
        <p>Nous vous informons que votre entreprise <strong>${raisonSociale}</strong> vous a délégué comme payeur sur la plateforme eCNSS.</p>`
    });
  } catch (err) {
    console.error('[utility2] sendComptePayeurMail:', err.message);
  }
}

/** Envoi email validation employeur avec pièce jointe PDF (notification d'immatriculation). */
async function sendMailEmployeurValidation(to, employeur, password, filePath) {
  if (!transporter || !to) return;
  const emp = employeur || {};
  const req = emp.request_employeur || {};
  const logoUrl = 'https://firebasestorage.googleapis.com/v0/b/guicart-1581b.appspot.com/o/restoImg%2FCNSS.jpg?alt=media&token=bc7160b0-c2aa-4e1c-afe5-4d1d590dd52f';
  const attachments = [];
  if (filePath && fs.existsSync(filePath)) {
    attachments.push({ filename: 'immatriculation.pdf', content: fs.readFileSync(filePath), encoding: 'base64' });
  }
  try {
    await transporter.sendMail({
      from: `"Notification CNSS" <${user_email_name}>`,
      to,
      subject: "Notification de Validation",
      html: `<img src="${logoUrl}" width="500" height="200" alt="CNSS" />
        <p>Bonjour Mr/Mme <strong>${req.first_name ?? ''} ${req.last_name ?? ''}</strong>,</p>
        <p>Votre entreprise <strong>${emp.raison_sociale ?? ''}</strong> (RCCM: <strong>${emp.no_rccm ?? ''}</strong>) a été immatriculée sous le numéro <strong>${emp.no_immatriculation ?? ''}</strong>.</p>
        <p>Accès espace employeur : N° identification <strong>${emp.no_immatriculation ?? ''}</strong>, Mot de passe <strong>${password ?? ''}</strong>.</p>
        <p><a href="https://compte.cnss.gov.gn">Cliquez pour continuer</a></p>
        <p style="color:red">NB : ces informations sont strictement personnelles.</p>`,
      attachments
    });
  } catch (err) {
    console.error('[utility2] sendMailEmployeurValidation:', err.message);
  }
}

/** Envoi email validation affiliation volontaire (accès assuré). */
async function sendMailAfflitionVolonValidation(to, affiliationVolontaire, password) {
  if (!transporter || !to) return;
  const av = affiliationVolontaire || {};
  const logoUrl = 'https://firebasestorage.googleapis.com/v0/b/guicart-1581b.appspot.com/o/restoImg%2FCNSS.jpg?alt=media&token=bc7160b0-c2aa-4e1c-afe5-4d1d590dd52f';
  try {
    await transporter.sendMail({
      from: `"Notification CNSS" <${user_email_name}>`,
      to,
      subject: "Notification de Validation - Affiliation Volontaire",
      html: `<img src="${logoUrl}" width="500" height="200" alt="CNSS" />
        <p>Bonjour Mr/Mme <strong>${av.prenom ?? ''} ${av.nom ?? ''}</strong>,</p>
        <p>Votre affiliation volontaire à la CNSS a été validée.</p>
        <p>N° identification : <strong>${av.no_immatriculation ?? ''}</strong><br/>Mot de passe : <strong>${password ?? ''}</strong></p>
        <p><a href="https://compte.cnss.gov.gn">Cliquez pour accéder à votre espace</a></p>
        <p style="color:red">NB : ne partagez pas ces informations.</p>`
    });
  } catch (err) {
    console.error('[utility2] sendMailAfflitionVolonValidation:', err.message);
  }
}

/** Envoi de la carte d'assuré (PDF) par email. */
async function sendMailCarteAssure(toEmail, employeName, pdfBuffer) {
  if (!transporter || !toEmail) {
    throw new Error('Email non configuré ou destinataire manquant');
  }
  const fileName = `carte-assure-${(employeName || 'assure').replace(/\s+/g, '-')}.pdf`;
  await transporter.sendMail({
    from: `"eCNSS - Carte d'assuré" <${user_email_name}>`,
    to: toEmail,
    subject: "Votre carte d'assuré social - CNSS Guinée",
    html: `
      <p>Bonjour${employeName ? ` ${employeName}` : ''},</p>
      <p>Veuillez trouver ci-joint votre carte d'assuré social (eCNSS).</p>
      <p>République de Guinée - Caisse Nationale de Sécurité Sociale</p>
    `,
    attachments: [{ filename: fileName, content: pdfBuffer }]
  });
}

// ---------- OTP (secret.json à la racine) ----------
async function generateOtpCode() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(SECRET_FILE)) return reject(new Error('secret.json absent'));
    fs.readFile(SECRET_FILE, 'utf8', (err, data) => {
      if (err) return reject(err);
      try {
        const otplib = require('otplib');
        otplib.authenticator.options = { window: 1, step: 300 };
        const { secret } = JSON.parse(data);
        resolve(otplib.authenticator.generate(secret));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function verifyOtp(code) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(SECRET_FILE)) return reject(new Error('secret.json absent'));
    fs.readFile(SECRET_FILE, 'utf8', (err, data) => {
      if (err) return reject(err);
      try {
        const otplib = require('otplib');
        const { secret } = JSON.parse(data);
        resolve(otplib.authenticator.check(String(code), secret));
      } catch (e) {
        reject(e);
      }
    });
  });
}

// ---------- Quitus PDF ----------
async function getQuittusFile(Employeur, code, fileName, category, reference, lastPaiementDate, expireDate, mounth, effectif) {
  let browser;
  try {
    const puppeteer = require('puppeteer');
    const logo = readImageBase64(IMAGE_PATHS.logo);
    const signature = readImageBase64(IMAGE_PATHS.signature);
    const simandou = readImageBase64(IMAGE_PATHS.simandou);
    const codeQR = await textQrcCode();

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Quitus</title>
    <style>@page{margin:0} body{margin:2cm;font-family:'Poppins',sans-serif} header{position:fixed;top:0;left:0;right:0;height:4cm} main{top:80px;position:relative} footer{position:fixed;bottom:0;left:0;right:0;height:2cm}</style></head><body>
    <header><div style="display:flex"><div style="width:35%"><img src="data:image/png;base64,${logo}" width="200" height="100"/></div>
    <div style="width:40%;margin-top:15px;text-align:center"><span style="font-size:20px">RÉPUBLIQUE DE GUINÉE</span><table style="width:100%"><tr><td>Travail - Justice - Solidarité</td></tr><tr><td>Caisse Nationale de Sécurité Sociale</td></tr></table>
    <table style="width:100%"><tr><td style="background:red;width:15%;height:2px"></td><td style="background:yellow;width:15%"></td><td style="background:green;width:15%"></td></tr></table></div>
    <div style="width:35%"><img src="data:image/png;base64,${simandou}" width="150" height="150" style="float:right;padding:5px"/></div></div></header>
    <main style="font-size:14px"><div style="width:50%;margin:auto;text-align:center;margin-top:30px;background:rgb(108,216,108)"><h1>QUITUS</h1></div>
    <table style="width:100%;margin-top:30px"><tr><td>Référence:</td><td>${reference ?? ''}</td></tr></table>
    <p>Je soussigné Monsieur <strong>le DIRECTEUR GÉNÉRAL</strong> de la CNSS atteste que la société</p>
    <div style="text-align:center;background:rgb(205,210,205);padding:2px"><h2>${Employeur?.raison_sociale ?? ''}</h2></div>
    <p>immatriculée sous le numéro <strong>${Employeur?.no_immatriculation ?? ''}</strong> déclare et paye ses cotisations à bonne date.</p>
    <table style="width:100%"><tr><td>Dernière date d'acquittement:</td><td style="background:rgb(205,210,205)">${lastPaiementDate ?? ''}</td></tr>
    <tr><td>Date d'expiration:</td><td style="background:rgb(205,210,205)">${expireDate ?? ''}</td></tr>
    <tr><td>Effectif déclaré:</td><td style="background:rgb(205,210,205)">${effectif ?? ''}</td></tr>
    <tr><td>Période de validité:</td><td style="background:rgb(67,69,67);color:white">${mounth ?? ''}</td></tr></table>
    <div style="display:flex;margin-top:40px"><div><img src="${codeQR}" alt="QR"/><p><strong>Code secret: ${code}</strong></p></div>
    <div style="text-align:right"><p>Conakry ${new Date().toLocaleDateString('fr-FR')}</p><p>Le Directeur Général</p><img src="data:image/png;base64,${signature}" width="200" height="100"/><p><strong>M. Bakary Sylla</strong></p></div></div>
    </main>
    <footer><div style="text-align:center;font-size:12px;width:100%"><span style="font-weight:bold">République de Guinée</span><br/><span>Caisse Nationale de sécurité Sociale, Kouléwondy - Kaloum BP 138</span></div></footer>
    </body></html>`;

    ensureDocsDir();
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    await page.pdf({ path: path.join(DOCS_DIR, `${fileName}.pdf`), format: 'A4', printBackground: true });
    return 'ooook';
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

// ---------- Récépissé Quitus PDF ----------
async function genererRecuQuitus(employeur, reference, fileName) {
  let browser;
  try {
    const puppeteer = require('puppeteer');
    const logo = readImageBase64(IMAGE_PATHS.logo);
    const branding = readImageBase64(IMAGE_PATHS.branding);
    const signature = readImageBase64(IMAGE_PATHS.signature);
    const barCode = readImageBase64(IMAGE_PATHS.bqrcode);

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Récépissé Quitus</title>
    <style>@page{margin:0} body{margin:2cm;font-family:'Poppins',sans-serif} header{position:fixed;top:0;left:0;right:0;height:4cm} main{top:80px;position:relative} footer{position:fixed;bottom:0;left:0;right:0;height:2cm}</style></head><body>
    <header><div style="display:flex"><div style="width:35%"><img src="data:image/png;base64,${logo}" width="200" height="100"/></div>
    <div style="width:40%;margin-top:15px;text-align:center"><span style="font-size:20px">RÉPUBLIQUE DE GUINÉE</span><table style="width:100%"><tr><td>Travail - Justice - Solidarité</td></tr><tr><td>Caisse Nationale de Sécurité Sociale</td></tr></table>
    <table style="width:100%"><tr><td style="background:red;width:15%;height:2px"></td><td style="background:yellow;width:15%"></td><td style="background:green;width:15%"></td></tr></table></div>
    <div style="width:35%"><img src="data:image/png;base64,${branding}" width="100" height="50" style="float:right;padding:10px"/></div></div></header>
    <main style="font-size:14px"><div style="width:50%;margin:auto;text-align:center;margin-top:30px;background:rgb(108,216,108)"><h1>RÉCÉPISSÉ QUITUS</h1></div>
    <table style="width:100%;margin-top:30px"><tr><td>Date:</td><td>${new Date().toLocaleDateString('fr-FR')}</td><td style="text-align:right">${reference}</td></tr></table>
    <table style="width:100%;margin-top:30px;border:1px solid #cdd2cd"><tr><td style="text-align:center;padding:10px;background:#cdd2cd">Raison Sociale<br/>${employeur?.raison_sociale ?? ''}</td><td style="text-align:center;padding:10px;background:#cdd2cd">N° Entreprise<br/>${employeur?.no_immatriculation ?? ''}</td></tr>
    <tr><td style="padding:10px">E-mail</td><td>${employeur?.email ?? ''}</td></tr><tr><td style="padding:10px">Adresse</td><td>${employeur?.adresse ?? ''}</td></tr><tr><td style="padding:10px">Téléphone</td><td>+224 ${employeur?.phone_number ?? ''}</td></tr></table>
    <p>NB: Conservez ce récépissé pour la récupération du quitus.</p>
    <div style="text-align:right;margin-top:60px"><p>Le Directeur Général</p><img src="data:image/png;base64,${signature}" width="200" height="100"/><p><strong>M. Bakary Sylla</strong></p></div>
    </main>
    <footer><div style="text-align:center;font-size:12px;width:100%"><span style="font-weight:bold">République de Guinée</span><br/><span>Caisse Nationale de sécurité Sociale, Kouléwondy - Kaloum BP 138</span></div></footer>
    </body></html>`;

    ensureDocsDir();
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    await page.pdf({ path: path.join(DOCS_DIR, `${fileName}.pdf`), format: 'A4', printBackground: true });
    return 'okokok';
  } catch (error) {
    console.error(error);
    appendTextToFile(error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

// ---------- Styles Excel communs ----------
const excelHeaderStyle = {
  fill: { fgColor: { rgb: '000000' } },
  font: { color: { rgb: 'FFFFFFFF' }, sz: 14, bold: true, underline: true }
};
const excelCellStyle = { fill: { fgColor: { rgb: 'FFFFFF' } } };

function buildExcelReport(specification, data, sheetName) {
  if (!excel || !excel.buildExport) {
    console.warn('[utility2] node-excel-export non disponible');
    return Buffer.from([]);
  }
  return excel.buildExport([{
    name: sheetName || 'Sheet1',
    data: data || [],
    specification: Object.fromEntries(
      Object.entries(specification).map(([k, v]) => [k, { ...v, headerStyle: excelHeaderStyle }])
    )
  }]);
}

async function getEmployeHisExcelFile(data) {
  const spec = {
    periode: { displayName: 'Mois', width: 120 },
    year: { displayName: 'Année', width: 120 },
    salary_brut: { displayName: 'Salaire Brut', width: 120 },
    salary_soumis_cotisation: { displayName: 'Salaire Soumis à cotisation', width: 120 },
    cotisation_employe: { displayName: 'Cotisation salarié', width: 120 },
    cotisation_emplyeur: { displayName: 'Cotisation employeur', width: 120 },
    total_cotisation: { displayName: 'Total cotisation', width: 120 },
    name_employeur: { displayName: 'Employeur', width: 120 }
  };
  return buildExcelReport(spec, data, 'fiche_declaration');
}

async function exportEmployeFile(data) {
  const spec = {
    matricule: { displayName: 'Matricule', width: 120 },
    first_name: { displayName: 'Prénom(s)', width: 120 },
    last_name: { displayName: 'Nom', width: 120 },
    no_immatriculation: { displayName: 'N° immatriculation', width: 120 },
    salary: { displayName: 'Salaire', width: 120 },
    statut: { displayName: 'Statut', width: 120 },
    immatriculation_date: { displayName: 'Date immatriculation', width: 120 },
    date_of_birth: { displayName: 'Date Naissance', width: 120 }
  };
  return buildExcelReport(spec, data, 'liste_employes');
}

async function exportDeclaration(data, periode, year) {
  const spec = {
    matricule: { displayName: 'Matricule', width: 120 },
    no_immatriculation: { displayName: 'N° immatriculation', width: 120 },
    first_name: { displayName: 'Prénom(s)', width: 120 },
    last_name: { displayName: 'Nom', width: 120 },
    salary_brut: { displayName: 'Salaire brut', width: 120 },
    ssc: { displayName: 'Salaire soumis à cotisation', width: 120 },
    cotisation_emplyeur: { displayName: 'Part employeur', width: 120 },
    cotisation_employe: { displayName: 'Part employe', width: 120 }
  };
  return buildExcelReport(spec, data, `${periode}-${year}`);
}

async function getImportFileForDeclaration(data) {
  const spec = {
    no_immatriculation: { displayName: 'N°immatriculation', width: 200 },
    matricule: { displayName: 'Matricule', width: 120 },
    first_name: { displayName: 'Prenom(s)', width: 120 },
    last_name: { displayName: 'Nom', width: 120 },
    salary: { displayName: 'Salaire', width: 120 }
  };
  return buildExcelReport(spec, Array.isArray(data) ? data : [], 'fiche_declaration');
}

async function exportPaiement(data) {
  const spec = {
    createdAt: { displayName: 'Date création', width: 200 },
    raison_sociale: { displayName: 'Raison sociale', width: 120 },
    periode: { displayName: 'Période', width: 120 },
    total_branche: { displayName: 'Montant à payer', width: 120 },
    bank_name: { displayName: 'Banque', width: 120 },
    paid_date: { displayName: 'Date de paiement', width: 120 }
  };
  return buildExcelReport(spec, data, 'Archive_des_paiements');
}

module.exports = {
  genereQuittance,
  sendMailSuccesfulPaiement,
  generateOtpCode,
  verifyOtp,
  sendOptByMail,
  sendMailAdhesion,
  sendValidateMailEmploye,
  sendComptePayeurMail,
  sendMailEmployeurValidation,
  sendMailAfflitionVolonValidation,
  sendMailCarteAssure,
  getQuittusFile,
  getEmployeHisExcelFile,
  getImportFileForDeclaration,
  CreateUserMail,
  SendDemandeMail,
  exportPaiement,
  genererRecuQuitus,
  exportEmployeFile,
  exportDeclaration
};
