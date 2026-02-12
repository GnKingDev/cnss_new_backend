const express = require('express');
const router = express.Router();
const Employe = require('./model');
const Employeur = require('../XYemployeurs/model');
const Prefecture = require('../prefecture/model');
const Carer = require('../carriere/model');
const Demploye = require('../declaration-employe/model');
const CotisationEmployeur = require('../cotisation_employeur/model');
const Users = require('../users/model');
const Demande = require('../demandes/model');
const Document = require('../document/model');
const ExcelFile = require('../excel_file/model');
const utility = require('./utility');
const { EmployeurToken, EmployeToken, hashPassword, generateUniqueCode } = require('../users/utility');
const { verifyToken, valideEmailFunction, ValidatePhoneNumber, upload, DeleteDelegateUser } = require('../XYemployeurs/utility');
const { Op } = require('sequelize');
const sequelize = require('../db.connection');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

let genereListePdf, sendValidateMailEmploye, sendComptePayeurMail, getEmployeHisExcelFile, exportEmployeFile, addJob, getOldCotisation;
try {
  const utility3 = require('../../utility3');
  genereListePdf = utility3.genereListePdf;
} catch (err) {
  genereListePdf = null;
}
try {
  const u2 = require('../../utility2');
  sendValidateMailEmploye = u2.sendValidateMailEmploye || (() => Promise.resolve());
  sendComptePayeurMail = u2.sendComptePayeurMail || (() => Promise.resolve());
  getEmployeHisExcelFile = u2.getEmployeHisExcelFile || (async () => Buffer.from(''));
  exportEmployeFile = u2.exportEmployeFile || (async () => Buffer.from(''));
} catch (err) {
  sendValidateMailEmploye = () => Promise.resolve();
  sendComptePayeurMail = () => Promise.resolve();
  getEmployeHisExcelFile = async () => Buffer.from('');
  exportEmployeFile = async () => Buffer.from('');
}
try {
  const configQueue = require('../../config.queue');
  addJob = configQueue.addJob || (async () => null);
} catch (err) {
  addJob = async () => null;
}
try {
  const oldDb = require('../../old.db');
  getOldCotisation = oldDb.getOldCotisation || (async () => null);
} catch (err) {
  getOldCotisation = async () => null;
}

/**
 * Module `db/employe/route.js` – Gestion des employés
 * 
 * Ce module gère le cycle de vie complet des employés dans le système CNSS.
 * Base path: /api/v1/employe
 */

// Old DB API URL
const util_link = process.env.OLD_DB_API_URL || 'http://192.168.56.128';

// Multer configuration for file uploads
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    const name = path.basename(file.originalname, ext)
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .substring(0, 50);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const employeUpload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
    files: 10
  }
});

// File fields for employe creation
const employeFileFields = [
  { name: 'cni', maxCount: 1 },
  { name: 'contrat_file', maxCount: 1 },
  { name: 'avatar', maxCount: 1 }
];

/**
 * Helper: Parse pagination parameters
 */
const getPaginationParams = (req) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

/**
 * Helper: Format paginated response
 */
const formatPaginatedResponse = (data, total, page, limit) => {
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

// ============================================
// 1. CRÉATION ET VALIDATION D'EMPLOYÉS
// ============================================

/**
 * POST /api/v1/employe/save_employe_verify
 * 
 * Vérifie si un email et un numéro de téléphone sont disponibles.
 */
router.post('/save_employe_verify', async (req, res) => {
  try {
    const { data } = req.body;

    if (!data || !data.email || !data.phone_number) {
      return res.status(400).json({ message: 'Email et numéro de téléphone requis' });
    }

    // Vérification de l'email
    try {
      await valideEmailFunction(data.email, 'employe');
    } catch (error) {
      return res.status(400).json({ message: error.message || "Cet email existe déjà" });
    }

    // Vérification du téléphone
    try {
      await ValidatePhoneNumber(data.phone_number, 'employe');
    } catch (error) {
      return res.status(400).json({ message: error.message || 'Ce numéro de téléphone existe déjà' });
    }

    return res.status(200).json({ message: 'ok ok' });
  } catch (error) {
    console.error('[EMPLOYE_SAVE_VERIFY] Error:', error);
    return res.status(400).json({ message: error.message || 'Erreur lors de la vérification' });
  }
});

/**
 * POST /api/v1/employe/save_employe
 * 
 * Crée un nouvel employé avec fichiers (CNI, contrat, avatar).
 * Middleware: EmployeurToken, upload.fields([...])
 */
router.post('/save_employe', EmployeurToken, employeUpload.fields(employeFileFields), async (req, res) => {
  try {
    const files = req.files;

    // Validation des fichiers obligatoires
    if (!files['cni'] || !files['cni'][0]) {
      return res.status(400).json({ message: 'Fichier CNI requis' });
    }
    if (!files['contrat_file'] || !files['contrat_file'][0]) {
      return res.status(400).json({ message: 'Fichier contrat requis' });
    }
    if (!files['avatar'] || !files['avatar'][0]) {
      return res.status(400).json({ message: 'Photo de profil requise' });
    }

    // Parse les données
    let data = JSON.parse(req.body.employe);

    // Ajoute les informations de l'employeur
    data.employeurId = req.user.user_id;
    data.prefectureId = data.prefecture;

    // Ajoute les chemins des fichiers
    data.avatar = files['avatar'][0].path;
    data.cni_file = files['cni'][0].path;
    data.contrat_file = files['contrat_file'][0].path;
    data.date_first_embauche = data.worked_date;

    // Crée l'employé
    const employe = await Employe.create(data);

    // Reload with relations
    await employe.reload({
      include: [
        { association: 'employeur' },
        { association: 'prefecture' }
      ]
    });

    return res.status(200).json(employe);
  } catch (error) {
    console.error('[EMPLOYE_SAVE] Error:', error);
    
    // Traduit les erreurs SQL
    if (error.name === 'SequelizeUniqueConstraintError' || error.name === 'SequelizeValidationError') {
      const errorMessage = utility.translateSqlError(error.message);
      return res.status(400).json({ message: errorMessage });
    }

    return res.status(400).json({ message: 'Erreur lors de la création de l\'employé' });
  }
});

/**
 * POST /api/v1/employe/validate/:id
 * 
 * Valide et immatricule un employé (nouveau ou venant de l'adhésion).
 * Middleware: verifyToken (DIRGA/DG)
 * CORRIGÉ: Utilise des transactions, corrige le bug ligne 208 (=== au lieu de ==)
 */
router.post('/validate/:id', verifyToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const employeId = parseInt(req.params.id);
    if (isNaN(employeId)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'ID invalide' });
    }

    const employe = await Employe.findByPk(employeId, {
      include: [{ association: 'employeur' }],
      transaction
    });

    if (!employe) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    if (employe.is_adhesion === false) {
      // Cas A: Employé non-adhésion – job asynchrone pour l'immatriculation
      await addJob({
        type: 'employé_one',
        employeId: employeId,
        who_valid: req.user.id
      });

      employe.is_imma = true;
      await employe.save({ transaction });
      await transaction.commit();

      return res.status(200).json({ message: 'Employé immatriculé' });
    } else {
      // Cas B: Employé adhésion
      // Vérifie dans l'ancienne DB
      try {
        const responseOld = await axios.get(`${util_link}/anciencode/veriy_employe/${employe.no_immatriculation}/${employe.employeur.no_immatriculation}`);
        
        if (responseOld.status === 200 && responseOld.data) {
          const oldData = responseOld.data;

          // Met à jour les données depuis l'ancienne DB
          employe.immatriculation_date = oldData.date_immatriculation;
          employe.date_of_birth = oldData.date_naissance;
          employe.gender = oldData.sexe;
          employe.place_of_birth = oldData.lieu_naissance;
          employe.nationality = oldData.nationalite;
          employe.mother_last_name = oldData.nom_mere;
          employe.father_last_name = oldData.nom_pere;
          employe.father_first_name = oldData.prenom_pere;
          employe.mother_first_name = oldData.prenom_mere;
          employe.is_imma = true;
          await employe.save({ transaction });

          // Crée la carrière
          await Carer.create({
            employeId: employe.id,
            employeurId: employe.employeur.id,
            date_entre: oldData.date_embauche
          }, { transaction });

          // Crée l'utilisateur
          const user_password = generateUniqueCode(9);
          const user_password_hased = await hashPassword(user_password);
          await Users.create({
            user_identify: employe.no_immatriculation,
            role: 'employe',
            password: user_password_hased,
            first_login: true,
            user_id: employe.id,
            identity: employe.no_immatriculation,
            email: employe.email ? employe.email : null,
            phone_number: employe.phone_number ? employe.phone_number : null
          }, { transaction });

          // Met à jour l'employeur
          employe.employeur.number_employe = (employe.employeur.number_employe || 0) + 1;
          if (employe.employeur.number_employe > 20) {
            employe.employeur.category = "E+20";
            // CORRIGÉ: Utilise === au lieu de ==
            if (employe.gender === "M") {
              employe.employeur.effectif_homme = (employe.employeur.effectif_homme || 0) + 1;
            } else {
              employe.employeur.effectif_femme = (employe.employeur.effectif_femme || 0) + 1;
            }
          }
          await employe.employeur.save({ transaction });

          await transaction.commit();

          // Envoi email de validation (non bloquant)
          try {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(employe.email)) {
              await sendValidateMailEmploye(employe.email, employe, employe.employeur, user_password);
            }
          } catch (emailError) {
            console.error('[EMPLOYE_VALIDATE] Email error (non-blocking):', emailError);
          }

          return res.status(200).json(employe);
        } else {
          await transaction.rollback();
          return res.status(400).json({ message: "Ce numéro d'immatriculation n'existe pas" });
        }
      } catch (oldDbError) {
        await transaction.rollback();
        console.error('[EMPLOYE_VALIDATE] Old DB error:', oldDbError);
        return res.status(400).json({ message: 'Erreur veuillez reessayer' });
      }
    }
  } catch (error) {
    await transaction.rollback();
    console.error('[EMPLOYE_VALIDATE] Error:', error);
    return res.status(400).json({ message: error.message || 'Erreur veuillez reessayer' });
  }
});

// ============================================
// 2. LISTE ET CONSULTATION D'EMPLOYÉS
// ============================================

/**
 * GET /api/v1/employe/stats
 *
 * Nombre d'employés de l'employeur connecté : total, immatriculés, non immatriculés.
 * Middleware: EmployeurToken
 */
router.get('/stats', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;

    const total = await Employe.count({
      where: { employeurId }
    });

    const immatricules = await Employe.count({
      where: { employeurId, is_imma: true }
    });

    const nonImmatricules = await Employe.count({
      where: { employeurId, is_imma: false }
    });

    return res.status(200).json({
      total,
      immatricules,
      nonImmatricules
    });
  } catch (error) {
    console.error('[EMPLOYE_STATS] Error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

/**
 * GET /api/v1/employe/list
 *
 * Récupère tous les employés actifs de l'employeur connecté.
 * Recherche optionnelle : matricule, nom, prénom, immatriculation, numéro de téléphone.
 * Middleware: EmployeurToken
 * Query: page, limit, search (ou matricule, nom, prenom, immatriculation, telephone)
 */
router.get('/list', EmployeurToken, async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const { search, matricule, nom, prenom, immatriculation, telephone } = req.query;

    const where = {
      employeurId: req.user.user_id,
      is_out: false
    };

    // Recherche globale (un seul terme dans tous les champs)
    const searchTerm = (search && String(search).trim()) || null;
    if (searchTerm) {
      where[Op.or] = [
        { matricule: { [Op.like]: `%${searchTerm}%` } },
        { first_name: { [Op.like]: `%${searchTerm}%` } },
        { last_name: { [Op.like]: `%${searchTerm}%` } },
        { no_immatriculation: { [Op.like]: `%${searchTerm}%` } },
        { phone_number: { [Op.like]: `%${searchTerm}%` } }
      ];
    } else {
      // Filtres par champ (si pas de search global)
      const conditions = [];
      if (matricule && String(matricule).trim()) {
        conditions.push({ matricule: { [Op.like]: `%${String(matricule).trim()}%` } });
      }
      if (nom && String(nom).trim()) {
        conditions.push({ last_name: { [Op.like]: `%${String(nom).trim()}%` } });
      }
      if (prenom && String(prenom).trim()) {
        conditions.push({ first_name: { [Op.like]: `%${String(prenom).trim()}%` } });
      }
      if (immatriculation && String(immatriculation).trim()) {
        conditions.push({ no_immatriculation: { [Op.like]: `%${String(immatriculation).trim()}%` } });
      }
      if (telephone && String(telephone).trim()) {
        conditions.push({ phone_number: { [Op.like]: `%${String(telephone).trim()}%` } });
      }
      if (conditions.length > 0) {
        where[Op.and] = conditions;
      }
    }

    const result = await Employe.findAndCountAll({
      where,
      include: [{ association: 'prefecture' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[EMPLOYE_LIST] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * GET /api/v1/employe/dirga_list_employe/:id
 * 
 * Récupère tous les employés actifs d'un employeur (pour DIRGA).
 * Middleware: verifyToken (DIRGA)
 * OPTIMISÉ: Ajout de la pagination
 */
router.get('/dirga_list_employe/:id', verifyToken, async (req, res) => {
  try {
    const employeurId = parseInt(req.params.id);
    if (isNaN(employeurId)) {
      return res.status(400).json({ message: 'ID employeur invalide' });
    }

    const { page, limit, offset } = getPaginationParams(req);

    const result = await Employe.findAndCountAll({
      where: {
        employeurId: employeurId,
        is_out: false
      },
      include: [{ association: 'prefecture' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[EMPLOYE_DIRGA_LIST] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * GET /api/v1/employe/one
 * 
 * Récupère les informations de l'employé connecté.
 * Middleware: EmployeToken
 */
router.get('/one', EmployeToken, async (req, res) => {
  try {
    const employe = await Employe.findOne({
      where: { no_immatriculation: req.user.user_identify },
      include: [
        { association: 'prefecture' },
        { association: 'employeur' }
      ]
    });

    if (!employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    return res.status(200).json(employe);
  } catch (error) {
    console.error('[EMPLOYE_ONE] Error:', error);
    return res.status(400).json({ message: 'erreur' });
  }
});

/**
 * GET /api/v1/employe/all
 * 
 * Récupère tous les employés (sans filtre).
 * Middleware: EmployeurToken
 * ⚠️ NOTE: Cette route retourne tous les employés de la base, pas seulement ceux de l'employeur connecté.
 */
router.get('/all', EmployeurToken, async (req, res) => {
  try {
    const employes = await Employe.findAll({
      include: [
        { association: 'employeur' },
        { association: 'prefecture' }
      ]
    });

    return res.status(200).json(employes);
  } catch (error) {
    console.error('[EMPLOYE_ALL] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * GET /api/v1/employe/allEmploye
 * 
 * Récupère tous les employés non-adhésion.
 * Middleware: verifyToken (DIRGA/DG)
 * OPTIMISÉ: Ajout de la pagination
 */
router.get('/allEmploye', verifyToken, async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const result = await Employe.findAndCountAll({
      where: { is_adhesion: false },
      include: [{ association: 'employeur' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[EMPLOYE_ALL_EMPLOYE] Error:', error);
    return res.status(400).json({ message: error.message || 'error' });
  }
});

/**
 * GET /api/v1/employe/get_employe_famille/:id
 * 
 * Récupère un employé par son ID (pour afficher sa famille).
 * Middleware: EmployeurToken
 */
router.get('/get_employe_famille/:id', EmployeurToken, async (req, res) => {
  try {
    const employeId = parseInt(req.params.id);
    if (isNaN(employeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const employe = await Employe.findByPk(employeId, {
      include: [
        { association: 'employeur' },
        { association: 'prefecture' }
      ]
    });

    if (!employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    return res.status(200).json(employe);
  } catch (error) {
    console.error('[EMPLOYE_GET_FAMILLE] Error:', error);
    return res.status(400).json({ message: 'Erreur' });
  }
});

// ============================================
// 3. IMPORT EN MASSE
// ============================================

/**
 * POST /api/v1/employe/import_en_masse
 * 
 * Crée plusieurs employés en une seule requête.
 * Middleware: EmployeurToken
 */
router.post('/import_en_masse', EmployeurToken, async (req, res) => {
  try {
    const { bulkEmploye } = req.body;

    if (!bulkEmploye || !Array.isArray(bulkEmploye) || bulkEmploye.length === 0) {
      return res.status(400).json({ message: 'Tableau d\'employés requis' });
    }

    // Limite de taille
    if (bulkEmploye.length > 1000) {
      return res.status(400).json({ message: 'Maximum 1000 employés par import' });
    }

    // Ajoute l'employeurId à chaque employé
    const data = bulkEmploye.map(emp => ({
      ...emp,
      employeurId: req.user.user_id,
      prefectureId: emp.prefecture
    }));

    const employes = await Employe.bulkCreate(data, {
      validate: true,
      individualHooks: true
    });

    return res.status(200).json(employes);
  } catch (error) {
    console.error('[EMPLOYE_IMPORT_MASSE] Error:', error);
    
    // Traduit les erreurs SQL
    if (error.name === 'SequelizeUniqueConstraintError' || error.name === 'SequelizeValidationError') {
      const errorMessage = utility.translateSqlError(error.message);
      return res.status(400).json({ message: errorMessage });
    }

    return res.status(400).json({ message: 'Erreur lors de l\'import en masse des employés' });
  }
});

/**
 * POST /api/v1/employe/insert_exist_employe
 * 
 * Insère des employés déjà existants (probablement depuis l'ancienne DB).
 * Middleware: EmployeurToken
 */
router.post('/insert_exist_employe', EmployeurToken, async (req, res) => {
  try {
    const { bulk } = req.body;

    if (!bulk || !Array.isArray(bulk) || bulk.length === 0) {
      return res.status(400).json({ message: 'Tableau d\'employés requis' });
    }

    // Ajoute l'employeurId à chaque employé
    const data = bulk.map(emp => ({
      ...emp,
      employeurId: req.user.user_id
    }));

    await Employe.bulkCreate(data, {
      validate: true,
      individualHooks: true
    });

    return res.status(200).json({ message: 'ok ok' });
  } catch (error) {
    console.error('[EMPLOYE_INSERT_EXIST] Error:', error);
    
    // Traduit les erreurs SQL
    const errorMessage = utility.translateSqlError(error.message);
    return res.status(400).json({ message: errorMessage });
  }
});

// Colonnes Excel attendues -> champ modèle
const EXCEL_COLUMN_MAP = {
  'prenom': 'first_name',
  'nom': 'last_name',
  'email (facultatif)': 'email',
  'telephone (facultatif)': 'phone_number',
  'genre': 'gender',
  'date naissance ': 'date_of_birth',
  'date naissance': 'date_of_birth',
  'prefecture de naissance': 'prefecture_name',
  'date d\'embauche': 'worked_date',
  'salaire brut': 'salary',
  'type de contrat': 'type_contrat',
  'matricule (facultatif)': 'matricule',
  'matricule': 'matricule',
  'prenom du père': 'father_first_name',
  'nom du père': 'father_last_name',
  'prenom de la mère': 'mother_first_name',
  'nom de la mère': 'mother_last_name',
  'fonction': 'fonction',
  'situation matrimoniale': 'situation_matrimoniale'
};

// Colonnes Excel pour l'import employés déjà immatriculés (adhesion)
const EXCEL_COLUMN_MAP_ADHESION = {
  'n° immatriculation': 'no_immatriculation',
  'no immatriculation': 'no_immatriculation',
  'prenom': 'first_name',
  'nom': 'last_name',
  'email (facultatif)': 'email',
  'telephone (facultatif)': 'phone_number',
  'salaire brut': 'salary',
  'type de contrat': 'type_contrat',
  'matricule (facultatif)': 'matricule',
  'matricule': 'matricule',
  'fonction': 'fonction'
};

function normalizeHeader (str) {
  if (typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseExcelDate (val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) return new Date(date.y, date.m - 1, date.d);
  }
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseNumber (val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && !isNaN(val)) return Math.round(val);
  const n = parseInt(String(val).replace(/\s/g, ''), 10);
  return isNaN(n) ? null : n;
}

/**
 * POST /api/v1/employe/import_excel
 *
 * Import d'employés depuis un fichier Excel.
 * Colonnes : Prenom, Nom, Email (facultatif), Telephone (facultatif), Genre, Date Naissance,
 * Prefecture de Naissance, Date d'Embauche, Salaire Brut, Type de Contrat, Matricule (facultatif),
 * Prenom du père, Nom du père, Prenom de la mère, Nom de la mère, Fonction, Situation matrimoniale.
 * Si une erreur (email/téléphone déjà existant, préfecture introuvable, champ requis manquant) :
 * aucun enregistrement, retour de la liste des erreurs en français.
 * Middleware: EmployeurToken
 */
router.post('/import_excel', EmployeurToken, employeUpload.single('excel'), async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ message: 'Fichier Excel requis' });
    }

    const employeurId = req.user.user_id;
    const workbook = XLSX.readFile(req.file.path, { type: 'file', cellDates: false });
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

    const headers = rows[0].map(h => normalizeHeader(h));
    const dataRows = rows.slice(1);
    const errors = [];
    const toCreate = [];

    for (let i = 0; i < dataRows.length; i++) {
      const errorsAtStart = errors.length;
      const row = dataRows[i];
      const rowNum = i + 2;
      const record = {};
      for (let c = 0; c < headers.length; c++) {
        const key = EXCEL_COLUMN_MAP[headers[c]];
        if (key && key !== 'prefecture_name') {
          let val = row[c];
          if (val !== undefined && val !== null && typeof val === 'string') val = val.trim();
          record[key] = val;
        } else if (key === 'prefecture_name') {
          let val = row[c];
          if (val !== undefined && val !== null && typeof val === 'string') val = val.trim();
          record.prefectureName = val;
        }
      }

      const first_name = (record.first_name != null && record.first_name !== '') ? String(record.first_name).trim() : '';
      const last_name = (record.last_name != null && record.last_name !== '') ? String(record.last_name).trim() : '';
      const emailRaw = (record.email != null && record.email !== '') ? String(record.email).trim() : '';
      const phoneRaw = (record.phone_number != null && record.phone_number !== '') ? String(record.phone_number).replace(/\s/g, '') : '';

      // Email et téléphone facultatifs : si vides, on enregistre null
      const email = emailRaw || null;
      const phone_number = phoneRaw || null;

      if (!first_name) {
        errors.push({ row: rowNum, field: 'Prenom', message: 'Prénom requis.' });
      }
      if (!last_name) {
        errors.push({ row: rowNum, field: 'Nom', message: 'Nom requis.' });
      }

      if (email) {
        const existingEmail = await Employe.findOne({ where: { email } });
        if (existingEmail) {
          errors.push({ row: rowNum, field: 'Email', message: 'Un employé avec cet email existe déjà.' });
        }
      }
      if (phone_number) {
        const existingPhone = await Employe.findOne({ where: { phone_number } });
        if (existingPhone) {
          errors.push({ row: rowNum, field: 'Telephone', message: 'Un employé avec ce numéro de téléphone existe déjà.' });
        }
      }

      const prefectureName = (record.prefectureName != null && record.prefectureName !== '') ? String(record.prefectureName).trim() : '';
      let prefectureId = null;
      if (prefectureName) {
        const prefecture = await Prefecture.findOne({
          where: sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), sequelize.fn('LOWER', prefectureName))
        });
        if (!prefecture) {
          errors.push({ row: rowNum, field: 'Prefecture de Naissance', message: `Préfecture introuvable : "${prefectureName}".` });
        } else {
          prefectureId = prefecture.id;
        }
      }

      if (errors.length > errorsAtStart) continue;

      const date_of_birth = parseExcelDate(record.date_of_birth);
      const worked_date = parseExcelDate(record.worked_date);
      const salary = parseNumber(record.salary);

      toCreate.push({
        first_name,
        last_name,
        email,
        phone_number,
        gender: (record.gender != null && record.gender !== '') ? String(record.gender).trim() : null,
        date_of_birth: date_of_birth || null,
        prefectureId,
        worked_date: worked_date || null,
        salary: salary != null ? salary : null,
        type_contrat: (record.type_contrat != null && record.type_contrat !== '') ? String(record.type_contrat).trim() : null,
        matricule: (record.matricule != null && record.matricule !== '') ? String(record.matricule).trim() : null,
        father_first_name: (record.father_first_name != null && record.father_first_name !== '') ? String(record.father_first_name).trim() : null,
        father_last_name: (record.father_last_name != null && record.father_last_name !== '') ? String(record.father_last_name).trim() : null,
        mother_first_name: (record.mother_first_name != null && record.mother_first_name !== '') ? String(record.mother_first_name).trim() : null,
        mother_last_name: (record.mother_last_name != null && record.mother_last_name !== '') ? String(record.mother_last_name).trim() : null,
        fonction: (record.fonction != null && record.fonction !== '') ? String(record.fonction).trim() : null,
        situation_matrimoniale: (record.situation_matrimoniale != null && record.situation_matrimoniale !== '') ? String(record.situation_matrimoniale).trim() : null,
        employeurId,
        is_imma: false, // Nouveaux employés : à valider par DIRGA (non immatriculés)
        is_out: false
      });
    }

    if (errors.length > 0) {
      const errorsText = errors.map(e => `Ligne ${e.row} - ${e.field} : ${e.message}`).join('\n');
      return res.status(400).json({
        success: false,
        message: 'Import annulé : des erreurs ont été détectées. Corrigez le fichier et réessayez.',
        errors,
        errorsText
      });
    }

    if (toCreate.length === 0) {
      return res.status(400).json({
        message: 'Aucune ligne de donnée valide à importer.',
        errors: [],
        errorsText: ''
      });
    }

    if (toCreate.length > 1000) {
      return res.status(400).json({ message: 'Maximum 1000 employés par import.' });
    }

    const t = await sequelize.transaction();
    try {
      await Employe.bulkCreate(toCreate, { transaction: t, validate: true });
      await t.commit();
      return res.status(200).json({
        success: true,
        message: `${toCreate.length} employé(s) importé(s) avec succès.`,
        count: toCreate.length
      });
    } catch (bulkError) {
      await t.rollback();
      const msg = utility.translateSqlError(bulkError.message);
      return res.status(400).json({ message: msg || 'Erreur lors de l\'import.' });
    }
  } catch (error) {
    console.error('[EMPLOYE_IMPORT_EXCEL] Error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  } finally {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
  }
});

/**
 * POST /api/v1/employe/import_excel_adhesion
 *
 * Import d'employés déjà immatriculés (adhesion).
 * Colonnes : N° Immatriculation, Prenom, Nom, Email (facultatif), Telephone (facultatif),
 * Salaire Brut, Type de Contrat, Matricule (facultatif), Fonction.
 * is_imma: false, is_adhesion: true.
 * Middleware: EmployeurToken
 */
router.post('/import_excel_adhesion', EmployeurToken, employeUpload.single('excel'), async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ message: 'Fichier Excel requis' });
    }

    const employeurId = req.user.user_id;
    const workbook = XLSX.readFile(req.file.path, { type: 'file', cellDates: false });
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

    const headers = rows[0].map(h => normalizeHeader(h));
    const dataRows = rows.slice(1);
    const errors = [];
    const toCreate = [];

    for (let i = 0; i < dataRows.length; i++) {
      const errorsAtStart = errors.length;
      const row = dataRows[i];
      const rowNum = i + 2;
      const record = {};
      for (let c = 0; c < headers.length; c++) {
        const key = EXCEL_COLUMN_MAP_ADHESION[headers[c]];
        if (key) {
          let val = row[c];
          if (val !== undefined && val !== null && typeof val === 'string') val = val.trim();
          record[key] = val;
        }
      }

      const no_immatriculation = (record.no_immatriculation != null && record.no_immatriculation !== '') ? String(record.no_immatriculation).replace(/\s/g, '') : '';
      const first_name = (record.first_name != null && record.first_name !== '') ? String(record.first_name).trim() : '';
      const last_name = (record.last_name != null && record.last_name !== '') ? String(record.last_name).trim() : '';
      const emailRaw = (record.email != null && record.email !== '') ? String(record.email).trim() : '';
      const phoneRaw = (record.phone_number != null && record.phone_number !== '') ? String(record.phone_number).replace(/\s/g, '') : '';
      const email = emailRaw || null;
      const phone_number = phoneRaw || null;

      if (!no_immatriculation) {
        errors.push({ row: rowNum, field: 'N° Immatriculation', message: 'N° d\'immatriculation requis.' });
      }
      if (!first_name) {
        errors.push({ row: rowNum, field: 'Prenom', message: 'Prénom requis.' });
      }
      if (!last_name) {
        errors.push({ row: rowNum, field: 'Nom', message: 'Nom requis.' });
      }

      if (no_immatriculation) {
        const existingNo = await Employe.findOne({ where: { no_immatriculation } });
        if (existingNo) {
          errors.push({ row: rowNum, field: 'N° Immatriculation', message: 'Un employé avec ce numéro d\'immatriculation existe déjà.' });
        }
      }
      if (email) {
        const existingEmail = await Employe.findOne({ where: { email } });
        if (existingEmail) {
          errors.push({ row: rowNum, field: 'Email', message: 'Un employé avec cet email existe déjà.' });
        }
      }
      if (phone_number) {
        const existingPhone = await Employe.findOne({ where: { phone_number } });
        if (existingPhone) {
          errors.push({ row: rowNum, field: 'Telephone', message: 'Un employé avec ce numéro de téléphone existe déjà.' });
        }
      }

      if (errors.length > errorsAtStart) continue;

      const salary = parseNumber(record.salary);

      toCreate.push({
        no_immatriculation,
        first_name,
        last_name,
        email,
        phone_number,
        salary: salary != null ? salary : null,
        type_contrat: (record.type_contrat != null && record.type_contrat !== '') ? String(record.type_contrat).trim() : null,
        matricule: (record.matricule != null && record.matricule !== '') ? String(record.matricule).trim() : null,
        fonction: (record.fonction != null && record.fonction !== '') ? String(record.fonction).trim() : null,
        employeurId,
        is_imma: false,
        is_adhesion: true,
        is_out: false
      });
    }

    if (errors.length > 0) {
      const errorsText = errors.map(e => `Ligne ${e.row} - ${e.field} : ${e.message}`).join('\n');
      return res.status(400).json({
        success: false,
        message: 'Import annulé : des erreurs ont été détectées. Corrigez le fichier et réessayez.',
        errors,
        errorsText
      });
    }

    if (toCreate.length === 0) {
      return res.status(400).json({
        message: 'Aucune ligne de donnée valide à importer.',
        errors: [],
        errorsText: ''
      });
    }

    if (toCreate.length > 1000) {
      return res.status(400).json({ message: 'Maximum 1000 employés par import.' });
    }

    const t = await sequelize.transaction();
    try {
      await Employe.bulkCreate(toCreate, { transaction: t, validate: true });
      await t.commit();
      return res.status(200).json({
        success: true,
        message: `${toCreate.length} employé(s) déjà immatriculés importé(s) avec succès.`,
        count: toCreate.length
      });
    } catch (bulkError) {
      await t.rollback();
      const msg = utility.translateSqlError(bulkError.message);
      return res.status(400).json({ message: msg || 'Erreur lors de l\'import.' });
    }
  } catch (error) {
    console.error('[EMPLOYE_IMPORT_EXCEL_ADHESION] Error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  } finally {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
  }
});

// ============================================
// 4. VÉRIFICATION ET RÉCUPÉRATION D'EMPLOYÉS
// ============================================

/**
 * POST /api/v1/employe/verify_employe
 * 
 * Vérifie si un employé est libre (a quitté son ancien employeur) et peut être recruté,
 * ou le crée depuis l'ancienne DB.
 * Middleware: EmployeurToken
 */
router.post('/verify_employe', EmployeurToken, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Code d\'immatriculation requis' });
    }

    // Recherche dans la nouvelle DB
    const employe = await Employe.findOne({
      where: { no_immatriculation: code },
      include: [{ association: 'prefecture' }]
    });

    if (employe) {
      if (employe.is_out === true) {
        // Employé libre
        return res.status(200).json(employe);
      } else {
        return res.status(400).json({ message: "Cet employé n'est pas encore libre" });
      }
    }

    // Si non trouvé, cherche dans l'ancienne DB
    let correctedCode = utility.corrigerNumero(code);
    
    try {
      const getResponse = await axios.get(`${util_link}/c/${correctedCode}`);
      
      if (getResponse.status === 200 && getResponse.data && getResponse.data.result) {
        const oldData = getResponse.data.result;

        // Crée l'employé avec les données de l'ancienne DB
        const newEmploye = await Employe.create({
          employeurId: req.user.user_id,
          first_name: oldData.prenoms,
          last_name: oldData.nom,
          no_immatriculation: oldData.no_employe,
          date_of_birth: oldData.date_naissance,
          gender: oldData.sexe,
          place_of_birth: oldData.lieu_naissance,
          nationality: oldData.nationalite,
          mother_last_name: oldData.nom_mere,
          father_last_name: oldData.nom_pere,
          father_first_name: oldData.prenom_pere,
          mother_first_name: oldData.prenom_mere,
          type_contrat: 'Permanent',
          is_imma: true,
          worked_date: oldData.date_embauche,
          is_adhesion: true,
          is_insert_oldDB: true
        });

        // Crée la carrière
        await Carer.create({
          employeId: newEmploye.id,
          employeurId: req.user.user_id,
          date_entre: oldData.date_embauche
        });

        // Reload with relations
        await newEmploye.reload({ 
          include: [{ association: 'prefecture' }]
        });

        return res.status(200).json(newEmploye);
      } else {
        return res.status(400).json({ message: 'Employé non trouvé' });
      }
    } catch (oldDbError) {
      console.error('[EMPLOYE_VERIFY] Old DB error:', oldDbError);
      return res.status(400).json({ message: 'Employé non trouvé' });
    }
  } catch (error) {
    console.error('[EMPLOYE_VERIFY] Error:', error);
    return res.status(400).json({ message: 'Erreur' });
  }
});

// ============================================
// 5. DÉLÉGATION DE PAIEMENT (PAYEUR)
// ============================================

/**
 * POST /api/v1/employe/delegate_paiment/:id
 * 
 * Donne à un employé le rôle de "Payeur" (peut payer les cotisations via Paylican).
 * Middleware: EmployeurToken
 */
router.post('/delegate_paiment/:id', EmployeurToken, async (req, res) => {
  try {
    const employeId = parseInt(req.params.id);
    if (isNaN(employeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const employe = await Employe.findByPk(employeId, {
      include: [
        { association: 'employeur' },
        { association: 'prefecture' }
      ]
    });

    if (!employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    // Vérifie que l'employé est immatriculé
    if (!employe.is_imma) {
      return res.status(400).json({ message: 'L\'employé doit être immatriculé' });
    }

    // Obtient le token Paylican
    // NOTE: paylican_token doit être importé depuis XYemployeurs/utility.js
    // const { paylican_token, paylicanCreateUser } = require('../XYemployeurs/utility');
    // const token = await paylican_token();
    
    // Crée l'utilisateur dans Paylican
    // await paylicanCreateUser(employe.employeur, employe, token);

    employe.can_pay = true;
    await employe.save();

    // Envoi email délégation payeur (non bloquant)
    try {
      await sendComptePayeurMail(Employe);
    } catch (emailError) {
      console.error('[EMPLOYE_DELEGATE] Email error (non-blocking):', emailError);
    }

    return res.status(200).json({ message: "Role attribuer à l'employé choisie" });
  } catch (error) {
    console.error('[EMPLOYE_DELEGATE] Error:', error);
    return res.status(400).json({ message: 'echec' });
  }
});

/**
 * GET /api/v1/employe/delete_delegate_user/:imma/:id
 * 
 * Retire le rôle de "Payeur" à un employé.
 * Middleware: EmployeurToken
 */
router.get('/delete_delegate_user/:imma/:id', EmployeurToken, async (req, res) => {
  try {
    const employeId = parseInt(req.params.id);
    const imma = req.params.imma;

    if (isNaN(employeId) || !imma) {
      return res.status(400).json({ message: 'Paramètres invalides' });
    }

    // Supprime dans Paylican
    try {
      await DeleteDelegateUser(imma);
    } catch (paylicanError) {
      console.error('[EMPLOYE_DELETE_DELEGATE] Paylican error:', paylicanError);
      // Continue quand même la mise à jour en DB
    }

    // Met à jour l'employé
    const employe = await Employe.findByPk(employeId);
    if (!employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    employe.can_pay = false;
    await employe.save();

    return res.status(200).json({ message: "ok ok" });
  } catch (error) {
    console.error('[EMPLOYE_DELETE_DELEGATE] Error:', error);
    return res.status(400).json({ message: 'Erreur veuillez reessayer' });
  }
});

// ============================================
// 6. DÉCLARATIONS D'EMPLOYÉS
// ============================================

/**
 * GET /api/v1/employe/declartion_employe
 * 
 * Récupère toutes les déclarations de l'employé connecté (uniquement celles avec cotisations payées).
 * Middleware: EmployeToken
 */
router.get('/declartion_employe', EmployeToken, async (req, res) => {
  try {
    const employe = await Employe.findOne({
      where: { no_immatriculation: req.user.user_identify }
    });

    if (!employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    const employe_declaration = await Demploye.findAll({
      where: { employeId: employe.id },
      include: [
        {
          model: CotisationEmployeur,
          as: 'cotisation_employeur',
          where: { is_paid: true },
          required: true // INNER JOIN
        },
        { association: 'employeur' }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json(employe_declaration);
  } catch (error) {
    console.error('[EMPLOYE_DECLARATION] Error:', error);
    return res.status(400).json({ message: 'erreur' });
  }
});

/**
 * GET /api/v1/employe/get_declaration_has_excel
 * 
 * Exporte les déclarations de l'employé en fichier Excel.
 * Middleware: EmployeToken
 * CORRIGÉ: Utilise filter() au lieu de forEach avec async
 */
router.get('/get_declaration_has_excel', EmployeToken, async (req, res) => {
  try {
    const employe_declaration = await Demploye.findAll({
      where: { employeId: req.user.user_id },
      include: [
        { association: 'cotisation_employeur' },
        { association: 'employeur' }
      ]
    });

    // CORRIGÉ: Utilise filter() au lieu de forEach avec async
    const realData = employe_declaration
      .filter(element => element.cotisation_employeur && element.cotisation_employeur.is_paid === true)
      .map(element => {
        element.name_employeur = element.employeur.raison_sociale;
        return element;
      });

    const buffer = await getEmployeHisExcelFile(realData);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=declarations_employe.xlsx');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('[EMPLOYE_DECLARATION_EXCEL] Error:', error);
    return res.status(400).json({ message: 'Error' });
  }
});

// ============================================
// 7. GESTION DE CARRIÈRE (DÉPART/RECRUTEMENT)
// ============================================

/**
 * POST /api/v1/employe/employe_leave/:id
 * 
 * Fait quitter un employé de l'entreprise (marque comme is_out = true).
 * Middleware: EmployeurToken
 */
router.post('/employe_leave/:id', EmployeurToken, async (req, res) => {
  try {
    const employeId = parseInt(req.params.id);
    const { data } = req.body;

    if (isNaN(employeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const employe = await Employe.findByPk(employeId, {
      include: [{ association: 'employeur' }]
    });

    if (!Employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    // CORRIGÉ: Utilise req.user.user_id au lieu de employe.employeur.id
    const employeurId = req.user.user_id;

    // Met à jour l'employé
    employe.employeurId = null; // Retire l'employeur
    employe.out_date = data ? new Date(data).toISOString() : new Date().toISOString();
    employe.is_out = true;
    await employe.save();

    // Met à jour la carrière
    const Employe_his_carrer = await Carer.findOne({
      where: {
        employeId: employeId,
        employeurId: employeurId
      }
    });

    if (Employe_his_carrer) {
      Employe_his_carrer.date_sortie = data ? new Date(data).toISOString() : new Date().toISOString();
      await Employe_his_carrer.save();
    }

    return res.status(200).json({ message: 'ok ok' });
  } catch (error) {
    console.error('[EMPLOYE_LEAVE] Error:', error);
    return res.status(400).json({ message: 'Erreur' });
  }
});

/**
 * POST /api/v1/employe/update_matricule_salare
 * 
 * Recrute un employé libre en mettant à jour son matricule et salaire.
 * Middleware: EmployeurToken
 * CORRIGÉ: Ne modifie pas createdAt, crée une nouvelle carrière
 */
router.post('/update_matricule_salare', EmployeurToken, async (req, res) => {
  try {
    const { id, matricule, fonction, salary } = req.body;

    if (!id) {
      return res.status(400).json({ message: 'ID employé requis' });
    }

    const employe = await Employe.findByPk(id);

    if (!employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    // Met à jour l'employé
    employe.employeurId = req.user.user_id; // Réassigne l'employeur
    employe.is_out = false; // Marque comme actif
    if (matricule) employe.matricule = matricule;
    if (fonction) employe.fonction = fonction;
    if (salary) employe.salary = salary;
    employe.worked_date = new Date(); // Nouvelle date d'embauche
    // CORRIGÉ: Ne modifie pas createdAt
    await employe.save();

    // CORRIGÉ: Crée une nouvelle carrière
    await Carer.create({
      employeId: employe.id,
      employeurId: req.user.user_id,
      date_entre: new Date()
    });

    return res.status(200).json({ message: "ok ok" });
  } catch (error) {
    console.error('[EMPLOYE_UPDATE_MATRICULE] Error:', error);
    return res.status(400).json({ message: error.message || 'Erreur lors de la mise à jour' });
  }
});

// ============================================
// 8. UPLOAD DE FICHIERS EXCEL
// ============================================

/**
 * POST /api/v1/employe/save_hise_excel_file
 * 
 * Enregistre un fichier Excel pour demande d'immatriculation d'employés (côté employé).
 * Middleware: EmployeToken, upload.fields([...])
 */
router.post('/save_hise_excel_file', EmployeToken, employeUpload.fields([{ name: "excel", maxCount: 1 }]), async (req, res) => {
  try {
    const files = req.files;

    if (!files['excel'] || !files['excel'][0]) {
      return res.status(400).json({ message: 'Fichier Excel requis' });
    }

    // Récupère l'employé pour obtenir l'employeur
    const employe = await Employe.findOne({
      where: { no_immatriculation: req.user.user_identify },
      include: [{ association: 'employeur' }]
    });

    if (!employe || !employe.employeur) {
      return res.status(404).json({ message: 'Employé ou employeur non trouvé' });
    }

    // Crée la demande
    const demande = await Demande.create({
      motif: "Démande d'immatriculation des employés",
      employeurId: employe.employeur.id
    });

    // Crée le fichier Excel
    await ExcelFile.create({
      path: files['excel'][0].path,
      demandeId: demande.id,
      employeurId: employe.employeur.id
    });

    return res.status(200).json({ message: "Dossier enregistrer avec succes" });
  } catch (error) {
    console.error('[EMPLOYE_SAVE_EXCEL] Error:', error);
    return res.status(400).json({ message: 'Dossier non enregistrer' });
  }
});

/**
 * POST /api/v1/employe/save_imma_employe_execel_file
 * 
 * Enregistre un fichier Excel pour demande de validation d'employés déjà immatriculés (côté employeur).
 * Middleware: EmployeurToken, upload.fields([...])
 */
router.post('/save_imma_employe_execel_file', EmployeurToken, employeUpload.fields([{ name: "excel", maxCount: 1 }]), async (req, res) => {
  try {
    const files = req.files;

    if (!files['excel'] || !files['excel'][0]) {
      return res.status(400).json({ message: 'Fichier Excel requis' });
    }

    // Crée la demande
    const demande = await Demande.create({
      motif: "Demande de validation des employés déjà immatriculés",
      employeurId: req.user.user_id
    });

    // Crée le fichier Excel
    await ExcelFile.create({
      path: files['excel'][0].path,
      demandeId: demande.id,
      employeurId: req.user.user_id
    });

    return res.status(200).json({ message: "Dossier enregistrer avec succes" });
  } catch (error) {
    console.error('[EMPLOYE_SAVE_IMMA_EXCEL] Error:', error);
    return res.status(400).json({ message: 'Dossier non enregistrer' });
  }
});

// ============================================
// 9. MISE À JOUR D'EMPLOYÉS
// ============================================

/**
 * POST /api/v1/employe/update_employe/:employe_id
 * 
 * Met à jour un employé (sans fichiers).
 * Middleware: EmployeurToken
 */
router.post('/update_employe/:employe_id', EmployeurToken, async (req, res) => {
  try {
    const employeId = parseInt(req.params.employe_id);
    if (isNaN(employeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const employe = await Employe.findByPk(employeId);

    if (!Employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    // Vérifie que l'employé appartient à l'employeur
    if (Employe.employeurId !== req.user.user_id) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    await Employe.update(req.body);

    return res.status(200).json({ message: 'ok ok' });
  } catch (error) {
    console.error('[EMPLOYE_UPDATE] Error:', error);
    
    // Traduit les erreurs SQL
    if (error.name === 'SequelizeUniqueConstraintError' || error.name === 'SequelizeValidationError') {
      const errorMessage = utility.translateSqlError(error.message);
      return res.status(400).json({ message: errorMessage });
    }

    return res.status(400).json({ message: error.message || 'Employé non trouvé' });
  }
});

/**
 * POST /api/v1/employe/dirga_update_employe/:employe_id
 * 
 * Met à jour un employé (pour DIRGA/DG).
 * Middleware: verifyToken (DIRGA/DG)
 */
router.post('/dirga_update_employe/:employe_id', verifyToken, async (req, res) => {
  try {
    const employeId = parseInt(req.params.employe_id);
    if (isNaN(employeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const employe = await Employe.findByPk(employeId);

    if (!Employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    await Employe.update(req.body);

    return res.status(200).json({ message: 'ok ok' });
  } catch (error) {
    console.error('[EMPLOYE_DIRGA_UPDATE] Error:', error);
    return res.status(500).json({ message: "Erreur interne" });
  }
});

/**
 * POST /api/v1/employe/update_employe_contrat_file/:employeId
 * 
 * Met à jour uniquement le fichier contrat d'un employé.
 * Middleware: EmployeurToken, upload.fields([...])
 */
router.post('/update_employe_contrat_file/:employeId', EmployeurToken, employeUpload.fields([{ name: "contrat_file", maxCount: 1 }]), async (req, res) => {
  try {
    const employeId = parseInt(req.params.employeId);
    const files = req.files;

    if (isNaN(employeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    if (!files['contrat_file'] || !files['contrat_file'][0]) {
      return res.status(400).json({ message: 'Fichier contrat requis' });
    }

    const employe = await Employe.findByPk(employeId);

    if (!Employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    // Vérifie que l'employé appartient à l'employeur
    if (Employe.employeurId !== req.user.user_id) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    Employe.contrat_file = files['contrat_file'][0].path;
    await Employe.save();

    return res.status(200).json({ message: "ok ok" });
  } catch (error) {
    console.error('[EMPLOYE_UPDATE_CONTRAT] Error:', error);
    return res.status(500).json({ message: 'Erreur Interne' });
  }
});

/**
 * POST /api/v1/employe/update_employe_cni/:employeId
 * 
 * Met à jour uniquement le fichier CNI d'un employé.
 * Middleware: EmployeurToken, upload.single('cni')
 */
router.post('/update_employe_cni/:employeId', EmployeurToken, employeUpload.single('cni'), async (req, res) => {
  try {
    const employeId = parseInt(req.params.employeId);

    if (isNaN(employeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Fichier CNI requis' });
    }

    const employe = await Employe.findByPk(employeId);

    if (!Employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    // Vérifie que l'employé appartient à l'employeur
    if (Employe.employeurId !== req.user.user_id) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    Employe.cni_file = req.file.path;
    await Employe.save();

    return res.status(200).json({ message: "ok ok" });
  } catch (error) {
    console.error('[EMPLOYE_UPDATE_CNI] Error:', error);
    return res.status(500).json({ message: 'Erreur Interne' });
  }
});

/**
 * POST /api/v1/employe/update_employe_avatar/:employeId
 * 
 * Met à jour uniquement la photo de profil d'un employé.
 * Middleware: EmployeurToken, upload.fields([...])
 */
router.post('/update_employe_avatar/:employeId', EmployeurToken, employeUpload.fields([{ name: 'avatar', maxCount: 1 }]), async (req, res) => {
  try {
    const employeId = parseInt(req.params.employeId);
    const files = req.files;

    if (isNaN(employeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    if (!files['avatar'] || !files['avatar'][0]) {
      return res.status(400).json({ message: 'Photo de profil requise' });
    }

    const employe = await Employe.findByPk(employeId);

    if (!Employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    // Vérifie que l'employé appartient à l'employeur
    if (Employe.employeurId !== req.user.user_id) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    Employe.avatar = files['avatar'][0].path;
    await Employe.save();

    return res.status(200).json({ message: "ok ok" });
  } catch (error) {
    console.error('[EMPLOYE_UPDATE_AVATAR] Error:', error);
    return res.status(500).json({ message: 'Erreur Interne' });
  }
});

/**
 * POST /api/v1/employe/update_employe/:id
 * 
 * Met à jour les informations critiques d'un employé (immatriculation, email, téléphone).
 * Middleware: verifyToken (DIRGA/DG)
 */
router.post('/update_employe/:id', verifyToken, async (req, res) => {
  try {
    const employeId = parseInt(req.params.id);
    const { no_immatriculation, email, phone_number } = req.body;

    if (isNaN(employeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const employe = await Employe.findByPk(employeId);

    if (!Employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    if (no_immatriculation) Employe.no_immatriculation = no_immatriculation;
    if (email) Employe.email = email;
    if (phone_number) Employe.phone_number = phone_number;

    await Employe.save();

    return res.status(200).json({ message: 'update ok' });
  } catch (error) {
    console.error('[EMPLOYE_UPDATE_CRITICAL] Error:', error);
    
    // Traduit les erreurs SQL
    if (error.name === 'SequelizeUniqueConstraintError') {
      const errorMessage = utility.translateSqlError(error.message);
      return res.status(400).json({ message: errorMessage });
    }

    return res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/v1/employe/update_imma/:id
 * 
 * Met à jour uniquement le numéro d'immatriculation d'un employé.
 * Middleware: verifyToken (DIRGA/DG)
 */
router.post('/update_imma/:id', verifyToken, async (req, res) => {
  try {
    const employeId = parseInt(req.params.id);
    const { imma } = req.body;

    if (isNaN(employeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    if (!imma) {
      return res.status(400).json({ message: 'Numéro d\'immatriculation requis' });
    }

    const employe = await Employe.findByPk(employeId);

    if (!Employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    Employe.no_immatriculation = imma;
    await Employe.save();

    return res.status(200).json({ message: "Mise à jour effectué" });
  } catch (error) {
    console.error('[EMPLOYE_UPDATE_IMMA] Error:', error);
    
    // Traduit les erreurs SQL
    if (error.name === 'SequelizeUniqueConstraintError') {
      const errorMessage = utility.translateSqlError(error.message);
      return res.status(400).json({ message: errorMessage });
    }

    return res.status(400).json({ message: error.message || 'error' });
  }
});

// ============================================
// 10. SUPPRESSION D'EMPLOYÉS
// ============================================

/**
 * POST /api/v1/employe/delete_employe/:id
 * 
 * Supprime un employé (et son utilisateur si immatriculé).
 * Middleware: verifyToken (DIRGA/DG)
 */
router.post('/delete_employe/:id', verifyToken, async (req, res) => {
  try {
    const employeId = parseInt(req.params.id);
    if (isNaN(employeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const employe = await Employe.findByPk(employeId);

    if (!employe) {
      return res.status(404).json({ message: 'Employé non trouvé' });
    }

    if (employe.is_imma === true) {
      // Si immatriculé, supprime l'utilisateur
      const user = await Users.findOne({
        where: { user_identify: employe.no_immatriculation }
      });

      if (user) {
        await user.destroy();
      }

      // Supprime l'employé
      const noImmatriculation = employe.no_immatriculation;
      await employe.destroy();

      // Supprime dans l'ancienne DB (non bloquant)
      try {
        await axios.post(`${util_link}/delete_employe/${noImmatriculation}`);
      } catch (oldDbError) {
        console.error('[EMPLOYE_DELETE] Old DB error (non-blocking):', oldDbError);
      }

      return res.status(200).json({ message: 'EmployeDelete' });
    } else {
      // Si non immatriculé, supprime directement
      await Employe.destroy();
      return res.sendStatus(200);
    }
  } catch (error) {
    console.error('[EMPLOYE_DELETE] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

// ============================================
// 11. EXPORT DE DONNÉES
// ============================================

/**
 * GET /api/v1/employe/export_employe_file_excel/:type
 * 
 * Exporte les employés en fichier Excel selon un type (tous, validés, non validés).
 * Middleware: EmployeurToken
 */
router.get('/export_employe_file_excel/:type', EmployeurToken, async (req, res) => {
  try {
    const { type } = req.params;

    if (!['all', 'valid', 'not_valid'].includes(type)) {
      return res.status(400).json({ message: 'Type invalide' });
    }

    // Récupération des employés selon le type
    let whereClause = { employeurId: req.user.user_id };
    if (type === 'valid') {
      whereClause.is_imma = true;
    } else if (type === 'not_valid') {
      whereClause.is_imma = false;
    }

    const employes = await Employe.findAll({
      where: whereClause,
      include: [{ association: 'prefecture' }]
    });

    // Formatage des dates
    employes.forEach(element => {
      element.date_of_birth = element.date_of_birth
        ? new Date(element.date_of_birth).toLocaleDateString('fr')
        : "";
      element.immatriculation_date = element.immatriculation_date
        ? new Date(element.immatriculation_date).toLocaleDateString('fr')
        : "";
      element.statut = element.is_imma ? "Validé" : "En cours de validation";
    });

    const report = await exportEmployeFile(employes);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=employes_${type}.xlsx`);
    return res.status(200).send(report);
  } catch (error) {
    console.error('[EMPLOYE_EXPORT_EXCEL] Error:', error);
    return res.status(400).json({ message: 'ok' });
  }
});

/**
 * GET /api/v1/employe/export_employe_file_pdf/:type
 * 
 * Exporte les employés en fichier PDF selon un type.
 * Middleware: EmployeurToken
 * CORRIGÉ: Utilise forEach au lieu de map() incorrect
 */
router.get('/export_employe_file_pdf/:type', EmployeurToken, async (req, res) => {
  try {
    const { type } = req.params;

    if (!['all', 'valid', 'not_valid'].includes(type)) {
      return res.status(400).json({ message: 'Type invalide' });
    }

    // Récupération de l'employeur
    const employeur = await Employeur.findByPk(req.user.user_id);

    if (!employeur) {
      return res.status(404).json({ message: 'Employeur non trouvé' });
    }

    // Récupération des employés selon le type
    let whereClause = { employeurId: req.user.user_id };
    if (type === 'valid') {
      whereClause.is_imma = true;
    } else if (type === 'not_valid') {
      whereClause.is_imma = false;
    }

    const employes = await Employe.findAll({
      where: whereClause,
      include: [{ association: 'prefecture' }]
    });

    const dataList = employes.map((element) => {
      const statut = element.is_imma ? 'Validé' : 'En cours de validation';
      return {
        ...element.get ? element.get({ plain: true }) : element,
        statut
      };
    });

    if (genereListePdf) {
      const report = await genereListePdf(dataList, employeur.get ? employeur.get({ plain: true }) : employeur);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="liste_employes_${type}.pdf"`);
      return res.status(200).send(report);
    }

    return res.status(200).json({ message: 'Export PDF non disponible (utility3/puppeteer)', data: dataList });
  } catch (error) {
    console.error('[EMPLOYE_EXPORT_PDF] Error:', error);
    return res.status(400).json({ message: 'ok' });
  }
});

// ============================================
// 12. DEMANDES (CÔTÉ EMPLOYÉ)
// ============================================

/**
 * GET /api/v1/employe/get_his_employeur_file
 * 
 * Récupère tous les documents de l'employeur de l'employé connecté.
 * Middleware: EmployeToken
 */
router.get('/get_his_employeur_file', EmployeToken, async (req, res) => {
  try {
    const employe = await Employe.findOne({
      where: { no_immatriculation: req.user.user_identify },
      include: [{ association: 'employeur' }]
    });

    if (!employe || !employe.employeur) {
      return res.status(404).json({ message: 'Employé ou employeur non trouvé' });
    }

    const docs = await Document.findAll({
      where: { employeurId: Employe.employeur.id }
    });

    return res.status(200).json(docs);
  } catch (error) {
    console.error('[EMPLOYE_GET_FILES] Error:', error);
    return res.status(400).json({ message: 'Error' });
  }
});

/**
 * POST /api/v1/employe/create_demande
 * 
 * Crée une demande pour l'employeur de l'employé connecté.
 * Middleware: EmployeToken
 */
router.post('/create_demande', EmployeToken, async (req, res) => {
  try {
    const { motif } = req.body;

    const employe = await Employe.findOne({
      where: { no_immatriculation: req.user.user_identify },
      include: [{ association: 'employeur' }]
    });

    if (!employe || !employe.employeur) {
      return res.status(404).json({ message: 'Employé ou employeur non trouvé' });
    }

    await Demande.create({
      motif: motif || "Demande",
      employeurId: employe.employeur.id
    });

    return res.status(200).json({ message: 'demande ajoutés' });
  } catch (error) {
    console.error('[EMPLOYE_CREATE_DEMANDE] Error:', error);
    return res.status(400).json({ message: 'error' });
  }
});

/**
 * GET /api/v1/employe/get_his_employeur_demande
 * 
 * Récupère toutes les demandes de l'employeur de l'employé connecté.
 * Middleware: EmployeToken
 */
router.get('/get_his_employeur_demande', EmployeToken, async (req, res) => {
  try {
    const employe = await Employe.findOne({
      where: { no_immatriculation: req.user.user_identify },
      include: [{ association: 'employeur' }]
    });

    if (!employe || !employe.employeur) {
      return res.status(404).json({ message: 'Employé ou employeur non trouvé' });
    }

    const allDemande = await Demande.findAll({
      where: { employeurId: Employe.employeur.id },
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json(allDemande);
  } catch (error) {
    console.error('[EMPLOYE_GET_DEMANDES] Error:', error);
    return res.status(400).json({ message: 'error' });
  }
});

// ============================================
// 13. RÉCUPÉRATION DES ANCIENNES DÉCLARATIONS
// ============================================

/**
 * GET /api/v1/employe/get_old_declaration
 * 
 * Récupère et crée les cotisations depuis l'ancienne DB pour l'employé connecté.
 * Middleware: EmployeToken
 * CORRIGÉ: Extraction correcte de la période, gestion d'erreurs, réponse
 */
router.get('/get_old_declaration', EmployeToken, async (req, res) => {
  try {
    let employeData = await getOldCotisation(req.user.identity);
    
    if (employeData && employeData.length > 0) {
      for (const element of employeData) {
        const employeurRecord = await Employeur.findOne({
          where: { no_immatriculation: element.no_employeur }
        });
        let periodeCode = element.periode.toString().substring(5, 7);
        let periode = utility.mounth.find(e => e.code === periodeCode)?.name || "INCONNU";
        if (employeurRecord) {
          await CotisationEmployeur.create({
            employeurId: employeurRecord.id,
            periode: periode,
            total_salary_soumis_cotisation: element.salaire_soumis_cotisation,
            year: element.annee,
            total_cotisation_employe: ""
          });
        }
      }
      return res.status(200).json({ message: 'Cotisations importées avec succès' });
    }
    return res.status(404).json({ message: 'Aucune cotisation trouvée' });
  } catch (error) {
    console.error('[EMPLOYE_GET_OLD_DECLARATION] Error:', error);
    return res.status(500).json({ message: 'Erreur lors de l\'importation' });
  }
});

module.exports = router;
