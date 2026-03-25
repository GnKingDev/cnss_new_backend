/**
 * Génère le PDF de l'historique des cotisations d'un employé.
 * Inspiré de ficheEmployePdf.js : HTML puis Puppeteer -> PDF.
 */

const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '../..');

function formatNum(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return String(val);
  return new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(n) + ' GNF';
}

function buildCotisationsHtml(employe, summary, data) {
  const lastName = (employe.last_name || '—').trim();
  const firstName = (employe.first_name || '—').trim();
  const noImma = (employe.no_immatriculation || employe.matricule || '—').trim();
  const totalMois = summary.total_mois_cotises != null ? summary.total_mois_cotises : 0;
  const totalCotisations = summary.total_cotisations != null ? formatNum(summary.total_cotisations) : '—';
  const derniereCotisation = summary.derniere_cotisation || '—';

  const rows = (data || []).map((row) => {
    const periode = row.periode || '—';
    const salaireBrut = formatNum(row.salaire_brut);
    const cotSal = formatNum(row.cotisation_salariale);
    const cotPat = formatNum(row.cotisation_patronale);
    const total = formatNum(row.total);
    const statut = row.statut === 'paye' ? 'Payé' : 'En attente';
    return `<tr>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${periode}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: right; font-family: monospace;">${salaireBrut}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: right; font-family: monospace;">${cotSal}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: right; font-family: monospace;">${cotPat}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb; text-align: right; font-family: monospace; font-weight: 600;">${total}</td>
      <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${statut}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Historique des cotisations - ${lastName} ${firstName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #111827; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; }
  </style>
</head>
<body>
<div style="max-width: 800px; margin: 0 auto; background: #f9fafb;">
  <div style="background: linear-gradient(90deg, #1e3a29 0%, #2d5a3f 100%); padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <h1 style="color: #fff; font-size: 18px; font-weight: 600; margin: 0;">Historique des cotisations</h1>
    <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 6px 0 0 0;">${lastName} ${firstName}</p>
    <p style="color: rgba(255,255,255,0.75); font-size: 12px; margin: 2px 0 0 0; font-family: monospace;">N° Assuré : ${noImma}</p>
  </div>
  <div style="padding: 24px; background: #fff; border: 1px solid #e5e7eb; border-top: none;">
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; padding: 16px; background: #f3f4f6; border-radius: 8px;">
      <div>
        <p style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Total mois cotisés</p>
        <p style="font-size: 18px; font-weight: 700;">${totalMois} mois</p>
      </div>
      <div>
        <p style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Total cotisations</p>
        <p style="font-size: 18px; font-weight: 700; color: #059669;">${totalCotisations}</p>
      </div>
      <div>
        <p style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Dernière cotisation</p>
        <p style="font-size: 16px; font-weight: 600;">${derniereCotisation}</p>
      </div>
    </div>
    <h2 style="font-size: 14px; color: #374151; margin-bottom: 12px;">Détail par période</h2>
    <table>
      <thead>
        <tr style="background: #f3f4f6;">
          <th style="padding: 10px 12px; border: 1px solid #e5e7eb; text-align: left;">Période</th>
          <th style="padding: 10px 12px; border: 1px solid #e5e7eb; text-align: right;">Salaire brut</th>
          <th style="padding: 10px 12px; border: 1px solid #e5e7eb; text-align: right;">Cot. salariale (5%)</th>
          <th style="padding: 10px 12px; border: 1px solid #e5e7eb; text-align: right;">Cot. patronale (18%)</th>
          <th style="padding: 10px 12px; border: 1px solid #e5e7eb; text-align: right;">Total</th>
          <th style="padding: 10px 12px; border: 1px solid #e5e7eb;">Statut</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6" style="padding: 16px; text-align: center; color: #6b7280;">Aucune cotisation enregistrée</td></tr>'}
      </tbody>
    </table>
  </div>
</div>
</body>
</html>`;
}

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
    console.warn('[cotisationsPdf] Chrome local non trouvé:', err.message);
  }
  return null;
}

/**
 * @param {Object} employe - { first_name, last_name, no_immatriculation, matricule }
 * @param {Object} summary - { total_mois_cotises, total_cotisations, derniere_cotisation }
 * @param {Array} data - [{ periode, salaire_brut, cotisation_salariale, cotisation_patronale, total, statut }]
 * @returns {Promise<Buffer>}
 */
async function generateCotisationsPdfBuffer(employe, summary, data) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    return Promise.reject(new Error('puppeteer non installé pour generateCotisationsPdfBuffer'));
  }
  const html = buildCotisationsHtml(employe, summary, data);
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
    await page.emulateMediaType('screen');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
    });
    return Buffer.from(pdfBuffer);
  } catch (err) {
    console.error('[cotisationsPdf]', err.message);
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { generateCotisationsPdfBuffer };
