/**
 * Génère le PDF de la fiche employé (design aligné sur le modal détail).
 * Inspiré de getFileAppelCotisation (utility.js).
 * Retourne un Buffer binaire.
 */

const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '../..');

function formatDate(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

function formatSalary(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat('fr-GN', { style: 'decimal' }).format(val) + ' GNF';
}

function readAvatarBase64(avatarPath) {
  if (!avatarPath || avatarPath === 'uploads/user.jpeg') return null;
  const fullPath = path.isAbsolute(avatarPath) ? avatarPath : path.join(ROOT_DIR, avatarPath);
  try {
    if (fs.existsSync(fullPath)) {
      const buf = fs.readFileSync(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
      return 'data:' + mime + ';base64,' + buf.toString('base64');
    }
  } catch (err) {
    console.warn('[ficheEmployePdf] Avatar non lu:', fullPath, err.message);
  }
  return null;
}

function v(str) {
  return (str != null && str !== '') ? String(str).trim() : null;
}

function row(label, value) {
  const v2 = value != null && value !== '' ? value : '—';
  return `
    <div style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; display: grid; grid-template-columns: 1fr 2fr; gap: 16px;">
      <span style="font-size: 13px; color: #6b7280;">${label}</span>
      <span style="font-size: 13px; font-weight: 500; color: #111827;">${v2}</span>
    </div>`;
}

/**
 * Génère le HTML de la fiche employé (design modal).
 */
function buildFicheHtml(employe) {
  const lastName = v(employe.last_name) || '—';
  const firstName = v(employe.first_name) || '—';
  const position = v(employe.fonction) || '—';
  const isImma = employe.is_imma === true;
  const statusLabel = isImma ? 'Immatriculé' : 'En attente';
  const prefectureName = employe.prefecture && employe.prefecture.name ? employe.prefecture.name : (v(employe.prefecture_name) || '—');

  const avatarData = readAvatarBase64(employe.avatar);
  const photoHtml = avatarData
    ? `<img src="${avatarData}" alt="Photo" style="width:100%;height:100%;object-fit:cover;border-radius:9999px;" />`
    : `<div style="width:100%;height:100%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:14px;font-weight:600;border-radius:9999px;">${(firstName.charAt(0) || '')}${(lastName.charAt(0) || '')}</div>`;

  const genreLabel = employe.gender === 'M' ? 'Masculin' : employe.gender === 'F' ? 'Féminin' : (employe.gender || '—');
  const pere = (v(employe.father_first_name) || v(employe.father_last_name))
    ? `${v(employe.father_first_name) || ''} ${v(employe.father_last_name) || ''}`.trim()
    : null;
  const mere = (v(employe.mother_first_name) || v(employe.mother_last_name))
    ? `${v(employe.mother_first_name) || ''} ${v(employe.mother_last_name) || ''}`.trim()
    : null;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Fiche employé - ${lastName} ${firstName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #111827; line-height: 1.5; }
  </style>
</head>
<body>
<div style="max-width: 800px; margin: 0 auto; background: #f9fafb;">
  <!-- Header -->
  <div style="background: linear-gradient(90deg, #1e3a29 0%, #2d5a3f 100%); padding: 24px 24px; border-radius: 8px 8px 0 0;">
    <div style="display: flex; align-items: center; gap: 16px;">
      <div style="width: 64px; height: 64px; border-radius: 9999px; overflow: hidden; border: 2px solid rgba(255,255,255,0.2); flex-shrink: 0;">
        ${photoHtml}
      </div>
      <div>
        <h1 style="color: #fff; font-size: 20px; font-weight: 600; margin: 0;">${lastName} ${firstName}</h1>
        <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 4px 0 0 0;">${position}</p>
        <span style="display: inline-block; margin-top: 8px; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; ${isImma ? 'background: rgba(16,185,129,0.3); color: #a7f3d0; border: 1px solid rgba(16,185,129,0.4);' : 'background: rgba(245,158,11,0.3); color: #fef3c7; border: 1px solid rgba(245,158,11,0.4);'}">${statusLabel}</span>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div style="padding: 24px; background: #fff; margin: 0; border: 1px solid #e5e7eb; border-top: none;">
    <!-- Identifiants -->
    <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
        <div>
          <p style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Matricule</p>
          <p style="font-size: 16px; font-weight: 600;">${employe.id || '—'}</p>
        </div>
        <div>
          <p style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">N° Sécurité Sociale</p>
          <p style="font-size: 16px; font-weight: 600; font-family: monospace;">${v(employe.no_immatriculation) || v(employe.matricule) || '—'}</p>
        </div>
        <div>
          <p style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Salaire Brut</p>
          <p style="font-size: 16px; font-weight: 600;">${formatSalary(employe.salary)}</p>
        </div>
        <div>
          <p style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Date d'embauche</p>
          <p style="font-size: 16px; font-weight: 600;">${formatDate(employe.worked_date)}</p>
        </div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      <!-- État Civil -->
      <div>
        <h3 style="font-size: 12px; font-weight: 600; color: #111827; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">État Civil</h3>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 0 16px;">
          ${row('Nom', lastName)}
          ${row('Prénom', firstName)}
          ${row('Genre', genreLabel)}
          ${row('Date de naissance', formatDate(employe.date_of_birth))}
          ${row('Lieu de naissance', v(employe.place_of_birth))}
          ${row('Préfecture', prefectureName)}
          ${row('Nationalité', v(employe.nationality))}
          ${row('Situation matrimoniale', v(employe.situation_matrimoniale))}
        </div>
      </div>

      <!-- Informations Professionnelles -->
      <div>
        <h3 style="font-size: 12px; font-weight: 600; color: #111827; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">Informations Professionnelles</h3>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 0 16px;">
          ${row('Poste', position)}
          ${row('Date d\'embauche', formatDate(employe.worked_date))}
          ${row('Date d\'immatriculation', formatDate(employe.immatriculation_date))}
          ${row('Première embauche', formatDate(employe.date_first_embauche))}
          ${row('Salaire brut', formatSalary(employe.salary))}
        </div>
      </div>

      <!-- Contact -->
      <div>
        <h3 style="font-size: 12px; font-weight: 600; color: #111827; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">Contact</h3>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 0 16px;">
          ${row('Adresse', v(employe.adress))}
          ${row('Email', v(employe.email))}
          ${row('Téléphone', v(employe.phone_number))}
        </div>
      </div>

      <!-- Filiation -->
      <div>
        <h3 style="font-size: 12px; font-weight: 600; color: #111827; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">Filiation</h3>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 0 16px;">
          ${row('Père', pere)}
          ${row('Mère', mere)}
        </div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

/**
 * Génère le buffer PDF de la fiche employé.
 * Même approche que getFileAppelCotisation : launch, setContent, pdf.
 * @param {Object} employe - Données employé (avec prefecture si include)
 * @returns {Promise<Buffer>}
 */
/**
 * Résout le chemin vers le binaire Chrome local (chrome/).
 */
function resolveChromeExecutable() {
  const chromeDir = path.join(ROOT_DIR, 'chrome');
  if (!fs.existsSync(chromeDir)) return null;
  try {
    const dirs = fs.readdirSync(chromeDir);
    const macDir = dirs.find((d) => d.startsWith('mac_arm-') || d.startsWith('mac-'));
    if (!macDir) return null;
    const base = path.join(chromeDir, macDir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (fs.existsSync(base)) return base;
    const linuxDir = dirs.find((d) => d.startsWith('linux-'));
    if (linuxDir) {
      const linuxPath = path.join(chromeDir, linuxDir, 'chrome-linux64', 'chrome');
      if (fs.existsSync(linuxPath)) return linuxPath;
    }
  } catch (err) {
    console.warn('[ficheEmployePdf] Chrome local non trouvé:', err.message);
  }
  return null;
}

async function generateFicheEmployePdfBuffer(employe) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    return Promise.reject(new Error('puppeteer non installé pour generateFicheEmployePdfBuffer'));
  }

  const html = buildFicheHtml(employe);
  const executablePath = resolveChromeExecutable();
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', // Évite les problèmes /dev/shm (Docker, Linux)
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
  if (executablePath) {
    launchOpts.executablePath = executablePath;
  }
  let browser;
  try {
    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.emulateMediaType('screen');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 10, right: 10, bottom: 10, left: 10 }
    });
    return Buffer.from(pdfBuffer);
  } catch (err) {
    console.error('[ficheEmployePdf]', err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = { generateFicheEmployePdfBuffer };
