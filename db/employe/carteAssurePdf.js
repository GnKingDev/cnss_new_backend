/**
 * Génère le PDF de la carte d'assuré (eCNSS) selon la spec.
 * Retourne un Buffer binaire.
 */

const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const ROOT_DIR = path.resolve(__dirname, '../..');

/**
 * Formate le numéro assuré social : X XX XX XX XXX XXX (optionnel - XX)
 * Groupes : 1, 2, 2, 2, 3, 3 chiffres.
 */
function formatNumeroAssure(noImmatriculation) {
  if (!noImmatriculation || typeof noImmatriculation !== 'string') return '—';
  const s = noImmatriculation.replace(/\s/g, '');
  if (s.length < 12) return s;
  const rest = s.length > 12 ? ' - ' + s.substring(12, 14) : '';
  const a = s.substring(0, 1);
  const b = s.substring(1, 3);
  const c = s.substring(3, 5);
  const d = s.substring(5, 7);
  const e = s.substring(7, 10);
  const f = s.substring(10, 13);
  return `${a} ${b} ${c} ${d} ${e} ${f}${rest}`;
}

/**
 * Lit l'avatar en base64 (data URL) ou retourne une chaîne vide pour placeholder.
 */
function readAvatarBase64(avatarPath) {
  if (!avatarPath || avatarPath === 'uploads/user.jpeg') {
    return null; // pas de photo → afficher zone grise
  }
  const fullPath = path.isAbsolute(avatarPath) ? avatarPath : path.join(ROOT_DIR, avatarPath);
  try {
    if (fs.existsSync(fullPath)) {
      const buf = fs.readFileSync(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
      return 'data:' + mime + ';base64,' + buf.toString('base64');
    }
  } catch (err) {
    console.warn('[carteAssurePdf] Avatar non lu:', fullPath, err.message);
  }
  return null;
}

/**
 * Génère le HTML de la carte (400×250px) avec les données employé.
 */
function buildCardHtml(employe) {
  const last_name = (employe.last_name || '').toUpperCase().trim();
  const first_name = (employe.first_name || '').toUpperCase().trim();
  const no_immatriculation = employe.no_immatriculation || '';
  const numeroFormate = formatNumeroAssure(no_immatriculation);
  const dateEmission = employe.immatriculation_date || employe.worked_date || employe.createdAt || new Date();
  const dateStr = dateEmission instanceof Date
    ? dateEmission.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date(dateEmission).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const avatarData = readAvatarBase64(employe.avatar);
  const photoHtml = avatarData
    ? `<img src="${avatarData}" alt="Photo assuré" style="width:100%;height:100%;object-fit:cover;" />`
    : '<div style="width:100%;height:100%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:10px;">Photo</div>';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Carte assuré</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
  </style>
</head>
<body>
<div
  style="
    position: relative;
    width: 400px;
    height: 250px;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
    background: linear-gradient(135deg, #1a5c2e 0%, #2d8a4e 30%, #3da35d 60%, #52b788 100%);
  "
>
  <div
    style="
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      width: 40px;
      height: 32px;
      border-radius: 6px;
      background: linear-gradient(145deg, #d4af37 0%, #f4d03f 50%, #d4af37 100%);
      box-shadow: inset 0 0 4px rgba(0,0,0,0.3);
    "
  >
    <div style="position: absolute; inset: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px; opacity: 0.4;">
      <div style="background: #713f12; border-radius: 2px;"></div>
      <div style="background: #713f12; border-radius: 2px;"></div>
      <div style="background: #713f12; border-radius: 2px;"></div>
      <div style="background: #713f12; border-radius: 2px;"></div>
    </div>
  </div>

  <div style="position: absolute; left: 0; bottom: 16px; width: 24px; height: 32px; background: linear-gradient(90deg, #1a5c2e 0%, transparent 100%);">
    <svg viewBox="0 0 24 32" style="width: 100%; height: 100%; fill: #facc15;">
      <polygon points="0,8 16,16 0,24" />
    </svg>
  </div>

  <div style="position: absolute; top: 12px; left: 64px; right: 16px;">
    <h2 style="margin: 0; font-family: 'Arial Black', Arial, sans-serif; font-weight: bold; font-size: 1.875rem; color: #fde047; letter-spacing: -0.025em; text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">
      eCNSS
    </h2>
    <p style="margin: -4px 0 0 0; font-size: 12px; color: rgba(255,255,255,0.9);">
      carte d'assuré social - Guinée
    </p>
  </div>

  <div style="position: absolute; top: 48px; left: 64px;">
    <p style="margin: 0; font-size: 10px; color: rgba(255,255,255,0.8);">émise le</p>
    <p style="margin: 0; font-size: 14px; font-weight: 600; color: #fff;">${dateStr}</p>
  </div>

  <div style="position: absolute; top: 12px; right: 12px; width: 80px; height: 96px; background: #fff; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
    ${photoHtml}
  </div>

  <div style="position: absolute; right: 12px; top: 85px; bottom: 40px; width: 16px; display: flex; flex-direction: column; gap: 2px; opacity: 0.3;">
    <div style="background: #fff; height: 2px;"></div>
    <div style="background: #fff; height: 4px;"></div>
    <div style="background: #fff; height: 2px;"></div>
    <div style="background: #fff; height: 4px;"></div>
    <div style="background: #fff; height: 2px;"></div>
    <div style="background: #fff; height: 4px;"></div>
    <div style="background: #fff; height: 2px;"></div>
    <div style="background: #fff; height: 4px;"></div>
    <div style="background: #fff; height: 2px;"></div>
    <div style="background: #fff; height: 4px;"></div>
  </div>

  <div style="position: absolute; bottom: 48px; left: 64px; right: 32px;">
    <p style="margin: 0; font-size: 16px; font-weight: bold; color: #fff; text-transform: uppercase; letter-spacing: 0.05em;">${last_name || '—'}</p>
    <p style="margin: 0; font-size: 16px; color: #fff; text-transform: uppercase;">${first_name || '—'}</p>
  </div>

  <div style="position: absolute; bottom: 12px; left: 64px; right: 32px;">
    <p style="margin: 0; font-size: 14px; font-weight: 600; font-family: ui-monospace, monospace; color: #fff; letter-spacing: 0.1em;">${numeroFormate}</p>
  </div>

  <div style="position: absolute; inset: 0; pointer-events: none; opacity: 0.1; background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%);"></div>
</div>
</body>
</html>`;
}

/**
 * Génère le buffer PDF de la carte d'assuré.
 * @param {Object} employe - { first_name, last_name, no_immatriculation, avatar, immatriculation_date|worked_date }
 * @returns {Promise<Buffer>}
 */
async function generateCarteAssurePdfBuffer(employe) {
  const html = buildCardHtml(employe);
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 400, height: 250 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    const pdfBuffer = await page.pdf({
      width: '400px',
      height: '250px',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { generateCarteAssurePdfBuffer, formatNumeroAssure };
