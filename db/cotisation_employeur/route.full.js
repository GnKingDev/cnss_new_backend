/**
 * Routes cotisation employeur – version améliorée
 * Déclarations, factures, listes employés, complémentaires, import, webhook.
 *
 * Dépendances optionnelles à la racine du projet :
 * - ../../utility : getFileAppelCotisation
 * - ../../old.db : calculerDates, addDeclartionDebit
 * - ../../utility2 : getImportFileForDeclaration, exportDeclaration
 * - ../../save.error_log : appendTextToFile
 * - ../../utility3 : generelistDeclaration
 */
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { EmployeurToken, generateUniqueCode } = require('../users/utility');
const { verifyToken } = require('../XYemployeurs/utility');
const cotisationUtil = require('./utility');
const cotisation_employeur = require('./model');
const Demploye = require('../declaration-employe/model');
const paiement = require('../paiement/model');
const Employeur = require('../XYemployeurs/model');
const document = require('../document/model');
const employe = require('../employe/model');
const { Op } = require('sequelize');

const {
  MONTHS,
  hasPassed20th,
  getSalarySoumisCotisation,
  getCotisationForEmployee,
  computeBranches,
  getPenaliteAmount,
  isPeriodeDeclared,
  isTrimestreDeclared,
  buildSendDataBase,
  getMonthByName
} = cotisationUtil;

// Modules optionnels (racine projet)
let calculerDates, addDeclartionDebit, closePenality, getFileAppelCotisation, getImportFileForDeclaration, exportDeclaration, appendTextToFile, generelistDeclaration;
try {
  const oldDb = require('../../old.db');
  calculerDates = oldDb.calculerDates;
  addDeclartionDebit = oldDb.addDeclartionDebit;
  closePenality = oldDb.closePenality || (() => Promise.resolve());
} catch {
  calculerDates = (d) => ({ dateFinEchange: new Date(d) });
  addDeclartionDebit = async () => {};
  closePenality = () => Promise.resolve();
}
try {
  const rootUtil = require('../../utility');
  getFileAppelCotisation = rootUtil.getFileAppelCotisation || (() => Promise.reject(new Error('getFileAppelCotisation non disponible')));
} catch {
  getFileAppelCotisation = () => Promise.reject(new Error('getFileAppelCotisation non disponible'));
}
try {
  const u2 = require('../../utility2');
  getImportFileForDeclaration = u2.getImportFileForDeclaration || (async () => Buffer.from(''));
  exportDeclaration = u2.exportDeclaration || (async () => Buffer.from(''));
} catch {
  getImportFileForDeclaration = async () => Buffer.from('');
  exportDeclaration = async () => Buffer.from('');
}
try {
  const sel = require('../../save.error_log');
  appendTextToFile = sel.appendTextToFile || (() => {});
} catch {
  appendTextToFile = () => {};
}
try {
  const u3 = require('../../utility3');
  generelistDeclaration = u3.generelistDeclaration || (async () => Buffer.from(''));
} catch {
  generelistDeclaration = async () => Buffer.from('');
}
let processPaymentSuccess;
try {
  const paiementRoute = require('../paiement/route');
  processPaymentSuccess = paiementRoute.processPaymentSuccess || (async () => ({}));
} catch {
  processPaymentSuccess = async () => ({});
}

const router = express.Router();

/** Valeurs par défaut et max pour la pagination */
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/**
 * Parse les paramètres de pagination (query ou body).
 * @param {object} source - req.query ou req.body
 * @returns {{ page: number, pageSize: number, offset: number, limit: number }}
 */
function getPaginationParams(source = {}) {
  const page = Math.max(1, parseInt(source.page, 10) || DEFAULT_PAGE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(source.pageSize, 10) || DEFAULT_PAGE_SIZE));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    limit: pageSize
  };
}

/**
 * Formate la réponse paginée.
 */
function formatPaginatedResponse(data, totalItems, page, pageSize) {
  return {
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
    currentPage: page,
    pageSize,
    data
  };
}

/** Multer mémoire pour import Excel (import_liste) */
const uploadImportList = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }); // 15 MB

/** Normalise un en-tête Excel pour comparaison (minuscules, espaces uniformes) */
function normalizeHeader(str) {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Colonnes du fichier exporté par get_employe_for_import → clé interne */
const IMPORT_LISTE_COLUMNS = {
  'n°immatriculation': 'no_immatriculation',
  'no immatriculation': 'no_immatriculation',
  'n° immatriculation': 'no_immatriculation',
  'matricule': 'matricule',
  'prenom(s)': 'first_name',
  'prenoms': 'first_name',
  'nom': 'last_name',
  'salaire': 'salary'
};

// ---------- Déclaration principale ----------
router.post('/declare-periode', EmployeurToken, async (req, res) => {
  try {
    const data_cotisation_employeur = { ...req.body.cotisation_employeur };
    const data_declaration_employe = req.body.declaration_employe || [];
    data_cotisation_employeur.userId = req.user.id;
    data_cotisation_employeur.employeurId = req.user.user_id;

    const monthInfo = getMonthByName(data_cotisation_employeur.periode);
    if (!monthInfo) {
      return res.status(400).json({ message: 'Période invalide' });
    }
    data_cotisation_employeur.debut_echeance_principal = new Date(`${data_cotisation_employeur.year}-${monthInfo.code}-01`).toISOString();
    data_cotisation_employeur.fin_echeance_principal = calculerDates(data_cotisation_employeur.debut_echeance_principal).dateFinEchange;

    if (data_cotisation_employeur.periode) { 
      if (await isPeriodeDeclared(data_cotisation_employeur.periode, data_cotisation_employeur.year, req.user.user_id)) {
        return res.status(400).json({ message: 'Cette période a déjà été déclarée' });
      }
    } else {
      if (await isTrimestreDeclared(data_cotisation_employeur.trimestre, data_cotisation_employeur.year, req.user.user_id)) {
        return res.status(400).json({ message: 'Ce trimestre est déjà déclaré' });
      }
    }

    const Cemployeur = await cotisation_employeur.create(data_cotisation_employeur);

    if (hasPassed20th()) {
      Cemployeur.is_penalite_applied = true;
      Cemployeur.penelite_amount = getPenaliteAmount(Cemployeur.total_branche);
      await Cemployeur.save();
    }

    const declWithIds = data_declaration_employe.map((el) => ({
      ...el,
      employeurId: req.user.user_id,
      cotisation_employeurId: Cemployeur.id
    }));
    await Demploye.bulkCreate(declWithIds);

    await paiement.create({
      cotisation_employeurId: Cemployeur.id,
      employeurId: req.user.user_id
    });

    const fileName = data_cotisation_employeur.periode
      ? `Appel_retour_de_cotisation-${req.user.user_id}-${data_cotisation_employeur.periode}-${data_cotisation_employeur.year}-${generateUniqueCode(9)}`
      : `Appel_retour_de_cotisation-${req.user.user_id}-${data_cotisation_employeur.trimestre}-${data_cotisation_employeur.year}-${generateUniqueCode(9)}`;

    const EmployeurRecord = await Employeur.findByPk(req.user.user_id);
    const code = generateUniqueCode(9);

    try {
      const pdfResult = await getFileAppelCotisation(fileName, Cemployeur, 'FACTURE', EmployeurRecord, code);
      Cemployeur.facture_path = `/api/v1/docsx/${fileName}.pdf`;
      await Cemployeur.save();
      await document.create({
        name: `Facture-${data_cotisation_employeur.periode || data_cotisation_employeur.trimestre}-${data_cotisation_employeur.year}`,
        path: `/api/v1/docsx/${fileName}.pdf`,
        employeurId: req.user.user_id,
        code
      });
      const insertToOldb = await cotisation_employeur.findByPk(Cemployeur.id, { include: [{ model: Employeur, as: 'employeur' }] });
      addDeclartionDebit(insertToOldb, `${data_cotisation_employeur.year}${monthInfo.code}`);
      const pdfBase64 = pdfResult.buffer ? pdfResult.buffer.toString('base64') : null;
      return res.status(200).json({
        filePath: `${fileName}.pdf`,
        pdfBase64: pdfBase64 || undefined,
        is_penalite_applied: Cemployeur.is_penalite_applied,
        penelite_amount: Cemployeur.penelite_amount
      });
    } catch (err) {
      console.error(err);
      appendTextToFile(err.message);
      return res.status(400).json({ message: 'Facture non générée, veuillez réessayer plus tard' });
    }
  } catch (error) {
    console.error(error);
    appendTextToFile(error.message);
    res.status(400).json({ message: error.message });
  }
});

// ---------- Calcul facture (prévisualisation) ----------
router.post('/facture', EmployeurToken, async (req, res) => {
  try {
    const data = req.body.data;
    if (!data || !data.periode && !data.trimestre) {
      return res.status(400).json({ message: 'Période ou trimestre requis' });
    }

    if (data.periode) {
      if (await isPeriodeDeclared(data.periode, data.year, req.user.user_id)) {
        return res.status(400).json({ message: 'Cette période a déjà été déclarée' });
      }
    } else if (await isTrimestreDeclared(data.trimestre, data.year)) {
      return res.status(400).json({ message: 'Ce trimestre est déjà déclaré' });
    }

    const sendData = buildSendDataBase(data.year, data.periode);
    const EmployeList = await employe.findAll({ where: { employeurId: req.user.user_id, is_imma: true } });

    if (!EmployeList || EmployeList.length === 0) {
      return res.status(400).json({ message: 'Aucun employé immatriculé pour le moment' });
    }

    let get_ssc_stagiare_apprentis = 0;
    const monthInfo = getMonthByName(data.periode);

    for (const element of EmployeList) {
      const dateEmbauche = element.worked_date || element.createdAt;
      if (monthInfo && dateEmbauche && new Date(dateEmbauche).getMonth() === monthInfo.id) {
        sendData.effectif_embauche += 1;
      }
      sendData.total_salary += element.salary;
      sendData.current_effectif = EmployeList.length;

      const employe_salary_soumis = getSalarySoumisCotisation(element.salary, data.year);
      sendData.total_salary_soumis_cotisation += employe_salary_soumis;

      const plafond = employe_salary_soumis;
      const cot = getCotisationForEmployee(plafond, element.type_contrat);
      if (element.type_contrat === 'Stagiaire' || element.type_contrat === 'Apprenti') {
        get_ssc_stagiare_apprentis += plafond;
      }
      sendData.total_cotisation_employe += cot.cotisation_employe;
      sendData.total_cotisation_employeur += cot.cotisation_emplyeur;
      sendData.total_cotisation += cot.total_cotisation;
    }

    const branches = computeBranches(sendData.total_salary_soumis_cotisation, get_ssc_stagiare_apprentis);
    Object.assign(sendData, branches);
    sendData.total_branche = branches.total_branche;

    if (hasPassed20th()) {
      sendData.is_penalite_applied = true;
      sendData.penelite_amount = getPenaliteAmount(sendData.total_branche);
    }

    return res.status(200).json(sendData);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Calcul facture impossible, veuillez réessayer' });
  }
});

// ---------- Liste employés pour déclaration ----------
router.post('/employe_list', EmployeurToken, async (req, res) => {
  try {
    const data = req.body.data;
    if (!data) return res.status(400).json({ message: 'Données requises' });

    if (data.periode) {
      if (await isPeriodeDeclared(data.periode, data.year, req.user.user_id)) {
        return res.status(400).json({ message: 'La période choisie est déjà déclarée' });
      }
    } else if (await isTrimestreDeclared(data.trimestre, data.year, req.user.user_id)) {
      return res.status(400).json({ message: 'Le trimestre choisi est déjà déclaré' });
    }

    const { page, pageSize, offset, limit } = getPaginationParams(data);
    const { count: totalItems, rows: employesList } = await employe.findAndCountAll({
      where: { employeurId: req.user.user_id, is_imma: true, is_out: false },
      raw: true,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    if (!employesList.length && totalItems === 0) {
      return res.status(400).json({ message: 'Aucun employé immatriculé pour le moment' });
    }

    const fullList = employesList.map((element) => {
      const salary_soumis_cotisation = getSalarySoumisCotisation(element.salary, data.year);
      const plafond = salary_soumis_cotisation;
      const cot = getCotisationForEmployee(plafond, element.type_contrat);
      return {
        ...element,
        salary_soumis_cotisation,
        cotisation_employe: cot.cotisation_employe,
        cotisation_emplyeur: cot.cotisation_emplyeur,
        total_cotisation: cot.total_cotisation
      };
    });

    return res.status(200).json(formatPaginatedResponse(fullList, totalItems, page, pageSize));
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
});

router.get('/employeur', EmployeurToken, async (req, res) => {
  try {
    const EmployeurRecord = await Employeur.findOne({ where: { id: req.user.user_id } });
    return res.status(200).json(EmployeurRecord);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * Parse une date envoyée par le front (YYYY-MM-DD ou jj/mm/aaaa) en Date (début de jour).
 */
function parseDateStart(val) {
  if (!val || typeof val !== 'string') return null;
  const s = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00.000Z');
  const ddmmyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyy) return new Date(`${ddmmyy[3]}-${ddmmyy[2].padStart(2, '0')}-${ddmmyy[1].padStart(2, '0')}T00:00:00.000Z`);
  return null;
}

/**
 * Parse une date en fin de jour (23:59:59.999) pour filtre date_fin.
 */
function parseDateEnd(val) {
  const d = parseDateStart(val);
  if (!d) return null;
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

router.get('/list', EmployeurToken, async (req, res) => {
  try {
    const q = req.query;
    const { page, pageSize, offset, limit } = getPaginationParams(q);

    const where = { employeurId: req.user.user_id };

    if (q.year && String(q.year).toLowerCase() !== 'all') {
      const y = parseInt(q.year, 10);
      if (!isNaN(y)) where.year = y;
    }

    const dateDebut = parseDateStart(q.date_debut);
    const dateFin = parseDateEnd(q.date_fin);
    if (dateDebut && dateFin && dateDebut > dateFin) {
      return res.status(400).json({ message: 'La date début ne peut pas être après la date fin' });
    }
    if (dateDebut) where[Op.and] = (where[Op.and] || []).concat({ createdAt: { [Op.gte]: dateDebut } });
    if (dateFin) where[Op.and] = (where[Op.and] || []).concat({ createdAt: { [Op.lte]: dateFin } });

    if (q.search && String(q.search).trim()) {
      const s = String(q.search).trim();
      const searchConditions = [
        { periode: { [Op.like]: '%' + s + '%' } },
        { trimestre: { [Op.like]: '%' + s + '%' } }
      ];
      if (/^\d{4}$/.test(s)) searchConditions.push({ year: parseInt(s, 10) });
      where[Op.and] = (where[Op.and] || []).concat({ [Op.or]: searchConditions });
    }

    const { count, rows } = await cotisation_employeur.findAndCountAll({
      where,
      include: [{ model: Demploye, as: 'declarations_employes', include: [{ model: employe, as: 'employe' }] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });
    return res.status(200).json(formatPaginatedResponse(rows, count, page, pageSize));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ---------- Déclaration complémentaire ----------
router.post('/complementaire_list', EmployeurToken, async (req, res) => {
  try {
    const data = req.body;
    if (!data.periode) return res.status(400).json({ message: 'Période requise' });

    const is_periode_declared = await isPeriodeDeclared(data.periode, data.year, req.user.user_id);
    if (!is_periode_declared) {
      return res.status(400).json({ message: 'Cette période doit être déclarée d\'abord avant une déclaration complémentaire.' });
    }

    const employesList = await employe.findAll({ where: { employeurId: req.user.user_id, is_imma: true }, raw: true });
    if (!employesList.length) {
      return res.status(400).json({ message: 'Aucun employé immatriculé pour le moment' });
    }

    const fullList = employesList.map((element) => {
      const salary_soumis_cotisation = getSalarySoumisCotisation(element.salary, data.year);
      const plafond = salary_soumis_cotisation;
      const cot = getCotisationForEmployee(plafond, element.type_contrat);
      return {
        ...element,
        salary_soumis_cotisation,
        cotisation_employe: cot.cotisation_employe,
        cotisation_emplyeur: cot.cotisation_emplyeur,
        total_cotisation: cot.total_cotisation
      };
    });

    const { page, pageSize, offset, limit } = getPaginationParams(data);
    const totalItems = fullList.length;
    const paginatedData = fullList.slice(offset, offset + limit);
    return res.status(200).json(formatPaginatedResponse(paginatedData, totalItems, page, pageSize));
  } catch (error) {
    res.status(400).json({ message: 'Erreur, veuillez réessayer' });
  }
});

router.post('/complementaire_facture', EmployeurToken, async (req, res) => {
  try {
    const data = req.body;
    const sendData = buildSendDataBase(data.year, data.periode);
    const EmployeList = await employe.findAll({ where: { employeurId: req.user.user_id, is_imma: true } });
    sendData.current_effectif = EmployeList.length;
    let get_ssc_stagiare_apprentis = 0;
    const monthInfo = getMonthByName(data.periode);

    for (const element of data.bulk || []) {
      const dateEmbauche = element.worked_date || element.createdAt;
      if (monthInfo && dateEmbauche && new Date(dateEmbauche).getMonth() === monthInfo.id) sendData.effectif_embauche += 1;
      if (element.type_contrat === 'Stagiaire' || element.type_contrat === 'Apprenti') {
        get_ssc_stagiare_apprentis += element.salary_soumis_cotisation || 0;
      }
      sendData.total_salary_soumis_cotisation += element.salary_soumis_cotisation || 0;
      sendData.total_cotisation += element.total_cotisation || 0;
      sendData.total_cotisation_employeur += element.cotisation_emplyeur || 0;
      sendData.total_cotisation_employe += element.cotisation_employe || 0;
      sendData.total_salary += element.salary || 0;
    }

    const branches = computeBranches(sendData.total_salary_soumis_cotisation, get_ssc_stagiare_apprentis);
    Object.assign(sendData, branches);
    sendData.total_branche = branches.total_branche;
    return res.status(200).json(sendData);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Erreur' });
  }
});

router.post('/complementaire_declaration', EmployeurToken, async (req, res) => {
  try {
    const data_cotisation_employeur = { ...req.body.cotisation_employeur };
    const data_declaration_employe = req.body.declaration_employe || [];
    data_cotisation_employeur.userId = req.user.id;
    data_cotisation_employeur.employeurId = req.user.user_id;

    const monthInfo = getMonthByName(data_cotisation_employeur.periode);
    if (!monthInfo) return res.status(400).json({ message: 'Période invalide' });

    data_cotisation_employeur.debut_echeance_principal = new Date(`${data_cotisation_employeur.year}-${monthInfo.code}-01`).toISOString();
    data_cotisation_employeur.fin_echeance_principal = calculerDates(data_cotisation_employeur.debut_echeance_principal).dateFinEchange;
    data_cotisation_employeur.motif = 'FACTURATION COMPLEMENTAIRE SUR PRINCIPAL';

    const Cemployeur = await cotisation_employeur.create(data_cotisation_employeur);
    const declWithIds = data_declaration_employe.map((el) => ({
      ...el,
      employeurId: req.user.user_id,
      cotisation_employeurId: Cemployeur.id
    }));
    await Demploye.bulkCreate(declWithIds);
    await paiement.create({ cotisation_employeurId: Cemployeur.id, employeurId: req.user.user_id });

    const fileName = data_cotisation_employeur.periode
      ? `Facture_complementaire-${req.user.user_id}-${data_cotisation_employeur.periode}-${data_cotisation_employeur.year}-${generateUniqueCode(9)}`
      : `Appel_retour_de_cotisation-${req.user.user_id}-${data_cotisation_employeur.trimestre}-${data_cotisation_employeur.year}-${generateUniqueCode(8)}`;

    const EmployeurRecord = await Employeur.findByPk(req.user.user_id);
    const code = generateUniqueCode(9);

    try {
      const pdfResult = await getFileAppelCotisation(fileName, Cemployeur, 'FACTURE COMPLEMENTAIRE', EmployeurRecord, code);
      Cemployeur.facture_path = `/api/v1/docsx/${fileName}.pdf`;
      await Cemployeur.save();
      await document.create({
        name: `Facture complémentaire ${data_cotisation_employeur.periode}-${data_cotisation_employeur.year}`,
        path: `/api/v1/docsx/${fileName}.pdf`,
        employeurId: req.user.user_id,
        code
      });
      const insertToOldb = await cotisation_employeur.findByPk(Cemployeur.id, { include: [{ model: Employeur, as: 'employeur' }] });
      addDeclartionDebit(insertToOldb, `${data_cotisation_employeur.year}${monthInfo.code}`);
      const pdfBase64 = pdfResult.buffer ? pdfResult.buffer.toString('base64') : null;
      return res.status(200).json({
        filePath: `${fileName}.pdf`,
        pdfBase64: pdfBase64 || undefined
      });
    } catch (err) {
      console.error(err);
      return res.status(400).json({ message: 'Facture non générée, veuillez réessayer plus tard' });
    }
  } catch (error) {
    console.error(error);
    appendTextToFile(error.message);
    res.status(400).json({ message: error.message });
  }
});

// ---------- Import en masse (fichier Excel = même format que get_employe_for_import) ----------
router.post('/import_liste', EmployeurToken, uploadImportList.single('excel'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'Fichier Excel requis' });
    }

    let data = {};
    if (req.body.data) {
      try {
        data = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
      } catch {
        return res.status(400).json({ message: 'Paramètre "data" (JSON) invalide' });
      }
    }

    if (!data.year) {
      return res.status(400).json({ message: 'L\'année (year) est requise dans data' });
    }

    if (data.periode && (await isPeriodeDeclared(data.periode, data.year, req.user.user_id))) {
      return res.status(400).json({ message: 'Cette période a déjà été déclarée' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rows || rows.length < 2) {
      return res.status(400).json({
        message: 'Le fichier doit contenir une ligne d\'en-têtes et au moins une ligne de données.',
        errors: [],
        errorsText: ''
      });
    }

    const headers = rows[0].map(h => normalizeHeader(String(h)));
    const dataRows = rows.slice(1);
    const errors = [];

    const idxNoImma = headers.findIndex(h => IMPORT_LISTE_COLUMNS[h] === 'no_immatriculation');
    const idxSalary = headers.findIndex(h => IMPORT_LISTE_COLUMNS[h] === 'salary');
    if (idxNoImma === -1 || idxSalary === -1) {
      const missing = [];
      if (idxNoImma === -1) missing.push('N° Immatriculation');
      if (idxSalary === -1) missing.push('Salaire');
      return res.status(400).json({
        message: `Colonne(s) obligatoire(s) manquante(s) : ${missing.join(', ')}. Le fichier doit avoir le même format que le modèle (get_employe_for_import).`,
        errors: [{ row: 1, field: 'En-têtes', message: `Colonne(s) requise(s) : ${missing.join(', ')}` }],
        errorsText: `Colonne(s) obligatoire(s) manquante(s) : ${missing.join(', ')}`
      });
    }

    const parsedRows = [];
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2;
      const no_immatriculation = row[idxNoImma] != null ? String(row[idxNoImma]).trim() : '';
      let salaryRaw = row[idxSalary];
      if (salaryRaw === undefined || salaryRaw === null || salaryRaw === '') {
        errors.push({ row: rowNum, field: 'Salaire', message: 'Le salaire est obligatoire.' });
        continue;
      }
      const salaryNum = typeof salaryRaw === 'number' && !isNaN(salaryRaw)
        ? Math.round(salaryRaw)
        : parseInt(String(salaryRaw).replace(/\s/g, ''), 10);
      if (isNaN(salaryNum)) {
        errors.push({ row: rowNum, field: 'Salaire', message: 'Le salaire doit être un nombre.' });
        continue;
      }
      if (salaryNum < 0) {
        errors.push({ row: rowNum, field: 'Salaire', message: 'Le salaire ne peut pas être négatif.' });
        continue;
      }
      if (!no_immatriculation) {
        errors.push({ row: rowNum, field: 'N° Immatriculation', message: 'Le numéro d\'immatriculation est obligatoire.' });
        continue;
      }
      parsedRows.push({ rowNum, no_immatriculation, salary: salaryNum });
    }

    if (errors.length > 0) {
      const errorsText = errors.map(e => `Ligne ${e.row} - ${e.field} : ${e.message}`).join('\n');
      return res.status(400).json({
        message: 'Import annulé : des erreurs ont été détectées dans le fichier. Corrigez et réessayez.',
        errors,
        errorsText
      });
    }

    const employeurId = req.user.user_id;
    const fullList = [];
    for (const { rowNum, no_immatriculation, salary } of parsedRows) {
      const emp = await employe.findOne({
        where: { employeurId, no_immatriculation, is_imma: true, is_out: false },
        raw: true
      });
      if (!emp) {
        errors.push({
          row: rowNum,
          field: 'N° Immatriculation',
          message: `Employé non trouvé ou non éligible pour cet employeur : "${no_immatriculation}".`
        });
        continue;
      }
      const salary_soumis_cotisation = getSalarySoumisCotisation(salary, data.year);
      const plafond = salary_soumis_cotisation;
      const cot = getCotisationForEmployee(plafond, emp.type_contrat);
      fullList.push({
        ...emp,
        salary,
        salary_soumis_cotisation,
        cotisation_employe: cot.cotisation_employe,
        cotisation_emplyeur: cot.cotisation_emplyeur,
        total_cotisation: cot.total_cotisation
      });
    }

    if (errors.length > 0) {
      const errorsText = errors.map(e => `Ligne ${e.row} - ${e.field} : ${e.message}`).join('\n');
      return res.status(400).json({
        message: 'Import annulé : des erreurs ont été détectées. Corrigez le fichier et réessayez.',
        errors,
        errorsText
      });
    }

    if (!fullList.length) {
      return res.status(400).json({ message: 'Aucun employé à déclarer pour cette période' });
    }

    const { page, pageSize, offset, limit } = getPaginationParams(data);
    const totalItems = fullList.length;
    const paginatedData = fullList.slice(offset, offset + limit);
    return res.status(200).json(formatPaginatedResponse(paginatedData, totalItems, page, pageSize));
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message || 'Erreur interne' });
  }
});

router.post('/import_facture', EmployeurToken, async (req, res) => {
  try {
    const data = req.body.data;
    if (data.periode && (await isPeriodeDeclared(data.periode, data.year, req.user.user_id))) {
      return res.status(400).json({ message: 'Cette période a déjà été déclarée' });
    }

    const sendData = buildSendDataBase(data.year, data.periode);
    let get_ssc_stagiare_apprentis = 0;
    const monthInfo = getMonthByName(data.periode);
    const employes = data.employes || [];

    for (const element of employes) {
      const dateEmbauche = element.worked_date || element.createdAt;
      if (monthInfo && dateEmbauche && new Date(dateEmbauche).getMonth() === monthInfo.id) sendData.effectif_embauche += 1;
      if (element.type_contrat === 'Stagiaire' || element.type_contrat === 'Apprenti') {
        get_ssc_stagiare_apprentis += element.salary_soumis_cotisation || 0;
      }
      sendData.total_salary_soumis_cotisation += element.salary_soumis_cotisation || 0;
      sendData.total_cotisation += element.total_cotisation || 0;
      sendData.total_cotisation_employeur += element.cotisation_emplyeur || 0;
      sendData.total_cotisation_employe += element.cotisation_employe || 0;
      sendData.total_salary += element.salary || 0;
    }
    sendData.current_effectif = employes.length;

    const branches = computeBranches(sendData.total_salary_soumis_cotisation, get_ssc_stagiare_apprentis);
    Object.assign(sendData, branches);
    sendData.total_branche = branches.total_branche;
    return res.status(200).json(sendData);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/get_employe_for_import', EmployeurToken, async (req, res) => {
  try {
    const EmployeList = await employe.findAll({ where: { employeurId: req.user.user_id, is_imma: true, is_out: false } });
    const buffer = await getImportFileForDeclaration(EmployeList);
    res.status(200).send(buffer);
  } catch (error) {
    res.status(400).json({ message: 'Erreur interne' });
  }
});

router.get('/get_declaration_to_excel/:id', EmployeurToken, async (req, res) => {
  try {
    const Demployeur = await cotisation_employeur.findByPk(req.params.id, {
      include: [{ model: Demploye, as: 'declarations_employes', include: [{ model: employe, as: 'employe' }] }]
    });
    if (!Demployeur || !Demployeur.declarations_employes) {
      return res.status(404).json({ message: 'Déclaration introuvable' });
    }
    const exportData = Demployeur.declarations_employes.map((element) => ({
      matricule: element.employe?.matricule,
      no_immatriculation: element.employe?.no_immatriculation,
      first_name: element.employe?.first_name,
      last_name: element.employe?.last_name,
      salary_brut: element.salary_brut,
      ssc: element.salary_soumis_cotisation,
      cotisation_emplyeur: element.cotisation_emplyeur,
      cotisation_employe: element.cotisation_employe
    }));
    const buffer = await exportDeclaration(exportData, Demployeur.periode, Demployeur.year);
    res.status(200).send(buffer);
  } catch (error) {
    console.error(error);
    res.status(400).send('Erreur export');
  }
});

router.get('/get_declaration_pdf/:id', EmployeurToken, async (req, res) => {
  try {
    const EmployeurRecord = await Employeur.findByPk(req.user.user_id);
    const Demployeur = await cotisation_employeur.findByPk(req.params.id, {
      include: [{ model: Demploye, as: 'declarations_employes', include: [{ model: employe, as: 'employe' }] }]
    });
    if (!Demployeur || !Demployeur.declarations_employes) {
      return res.status(404).json({ message: 'Déclaration introuvable' });
    }
    const exportData = Demployeur.declarations_employes.map((element) => ({
      matricule: element.employe?.matricule,
      no_immatriculation: element.employe?.no_immatriculation,
      first_name: element.employe?.first_name,
      last_name: element.employe?.last_name,
      salary_brut: element.salary_brut,
      ssc: element.salary_soumis_cotisation,
      cotisation_emplyeur: element.cotisation_emplyeur,
      cotisation_employe: element.cotisation_employe
    }));
    const buffer = await generelistDeclaration(exportData, EmployeurRecord, Demployeur.periode, Demployeur.year);
    res.status(200).send(buffer);
  } catch (error) {
    res.status(400).json({ message: 'Erreur' });
  }
});

// ---------- Routes admin / DIRGA ----------
router.get('/get_employeur_all_declaration/:employeurId', verifyToken, async (req, res) => {
  try {
    const employeurId = parseInt(req.params.employeurId, 10);
    if (isNaN(employeurId)) return res.status(400).json({ message: 'ID employeur invalide' });
    const { page, pageSize, offset, limit } = getPaginationParams(req.query);
    const { count, rows } = await cotisation_employeur.findAndCountAll({
      where: { employeurId, is_paid: true },
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [{ model: Demploye, as: 'declarations_employes' }]
    });
    return res.status(200).json(formatPaginatedResponse(rows, count, page, pageSize));
  } catch (error) {
    console.error('Erreur serveur :', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des données' });
  }
});

router.get('/get_employeur_all_declaration_not_paid/:employeurId', verifyToken, async (req, res) => {
  try {
    const { page, pageSize, offset, limit } = getPaginationParams(req.query);
    const { count, rows } = await cotisation_employeur.findAndCountAll({
      where: { employeurId: req.params.employeurId, is_paid: false, is_degrade_mode: true },
      include: [{ model: Demploye, as: 'declarations_employes' }],
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });
    return res.status(200).json(formatPaginatedResponse(rows, count, page, pageSize));
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Erreur lors de la récupération des données' });
  }
});

router.get('/get_employeur_decla_imma/:no_imma', verifyToken, async (req, res) => {
  try {
    const EmployeurRecord = await Employeur.findOne({ where: { no_immatriculation: req.params.no_imma } });
    if (!EmployeurRecord) return res.status(404).json({ message: 'Employeur introuvable' });
    const { page, pageSize, offset, limit } = getPaginationParams(req.query);
    const { count, rows } = await cotisation_employeur.findAndCountAll({
      where: { employeurId: EmployeurRecord.id, is_paid: true },
      include: [{ model: Demploye, as: 'declarations_employes' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });
    return res.status(200).json(formatPaginatedResponse(rows, count, page, pageSize));
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
});

// ---------- Webhook paiement ----------
router.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    const paymentType = data?.data?.additionalFields?.[0]?.value;

    if (paymentType === 'default') {
      const Paiement = await paiement.findOne({
        where: { invoiceId: data.data.id, merchantReference: data.data.documentNo },
        include: [cotisation_employeur, Employeur]
      });
      if (!Paiement) {
        return res.status(200).json({ message: 'Paiement introuvable par id et documentNo' });
      }
      if (Paiement.status === 'payé') return res.status(400).json({ message: 'Le statut du paiement a déjà été changé' });
      if (Paiement.status === 'Rejeté') return res.status(400).json({ message: 'Le statut du paiement a déjà été changé' });

      if (data.type === 'invoice.payment_initiated') {
        Paiement.status = 'En cours';
        await Paiement.save();
        return res.status(200).json({ message: 'Statut du paiement modifié' });
      }
      if (data.type === 'invoice.payment_error' || data.type === 'invoice.payment_rejected') {
        Paiement.status = 'Rejeté';
        await Paiement.save();
        return res.status(200).json({ message: 'Statut du paiement modifié' });
      }
      if (data.type === 'invoice.paid') {
        Paiement.status = 'Payé';
        Paiement.is_paid = true;
        Paiement.paiement_date = new Date().toISOString();
        Paiement.bank_name = data.data.bankCode;
        appendTextToFile(`code bank ${data.data.bankCode}`);
        let bankName = data.data.bankCode;
        try {
          const Banque = require('../banques/model');
          const bank = await Banque.findOne({ where: { collector_code: data.data.bankCode } });
          if (bank) bankName = bank.name;
        } catch (_) {}
        await Paiement.save();
        if (data.paid_by_us) {
          Paiement.paid_by_us = true;
          await Paiement.save();
        }
        try {
          await processPaymentSuccess(Paiement, bankName, !!data.paid_by_us);
        } catch (err) {
          console.error('[COTISATION_WEBHOOK] processPaymentSuccess:', err);
        }
        res.status(200).json({ message: 'Statut du paiement modifié' });
        return;
      }
    }

    if (paymentType === 'penalite') {
      const Penalite = require('../penalites/model');
      const penalite = await Penalite.findOne({
        where: { merchantReference: data.data.documentNo, invoiceId: data.data.id },
        include: [Employeur]
      });
      if (!penalite) return res.status(200).json({ message: 'Paiement introuvable' });
      if (penalite.status === 'Rejeté' || penalite.status === 'payé') {
        return res.status(200).json({ message: 'Le statut du paiement a déjà été changé' });
      }
      if (data.type === 'invoice.payment_initiated') {
        penalite.status = 'En cours';
        await penalite.save();
      } else if (data.type === 'invoice.payment_error' || data.type === 'invoice.payment_rejected') {
        penalite.status = 'Rejeté';
        await penalite.save();
      } else if (data.type === 'invoice.paid') {
        penalite.status = 'payé';
        penalite.is_paid = true;
        await penalite.save();
        await closePenality(penalite.employeur?.no_immatriculation, penalite);
      }
      return res.status(200).json({ message: 'ok' });
    }

    return res.status(200).json({ message: 'Webhook reçu' });
  } catch (error) {
    appendTextToFile(`webhook ${error.message}`);
    console.error(error);
    res.status(500).json({ message: 'Erreur interne' });
  }
});

const cotisation_emplyeur_router = router;
module.exports = {
  cotisation_emplyeur_router,
  MONTHS
};
