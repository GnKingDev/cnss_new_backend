const express = require('express');
const router = express.Router();
const Employe = require('./model');
const Employeur = require('../XYemployeurs/model');
const Prefecture = require('../prefecture/model');
const Carer = require('../carriere/model');
const Conjoint = require('../conjoint/model');
const Enfant = require('../enfant/model');
const Demploye = require('../declaration-employe/model');
const CotisationEmployeur = require('../cotisation_employeur/model');
const Users = require('../users/model');
const Demande = require('../demandes/model');
const Document = require('../document/model');
const ExcelFile = require('../excel_file/model');
const { generateCarteAssurePdfBuffer } = require('./carteAssurePdf');
const { generateFicheEmployePdfBuffer } = require('./ficheEmployePdf');
const { generateCotisationsPdfBuffer } = require('./cotisationsPdf');
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

/**
 * URL du serveur externe (ancienne base CNSS).
 * Permet de fouiller / récupérer un employé déjà immatriculé côté legacy.
 * Variable d'environnement : OLD_DB_API_URL (ex: http://192.168.56.128).
 */
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
    fileSize: 15 * 1024 * 1024, // 15 MB max par fichier
    files: 10
  }
});

// Multer pour PATCH famille : nombreux fichiers (photos conjoints/enfants, extraits)
const familleUpload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB par fichier
    files: 30
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
    if (!files['avatar'] || !files['avatar'][0]) {
      return res.status(400).json({ message: 'Photo de profil requise' });
    }

    // Parse les données
    let data = JSON.parse(req.body.employe);

    // Ajoute les informations de l'employeur
    data.employeurId = req.user.user_id;
    data.prefectureId = data.prefecture;

    // Ajoute les chemins des fichiers (relatifs uniquement: uploads/filename)
    data.avatar = 'uploads/' + path.basename(files['avatar'][0].path);
    data.cni_file = 'uploads/' + path.basename(files['cni'][0].path);
    data.contrat_file = (files['contrat_file'] && files['contrat_file'][0])
      ? 'uploads/' + path.basename(files['contrat_file'][0].path)
      : null;
    data.date_first_embauche = data.worked_date;

    // Nouveaux employés sans numéro d'immatriculation → statut "En cours de validation"
    data.no_immatriculation = null;
    data.is_imma = false;

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
    // S'assurer que le message d'erreur atteint l'utilisateur (doublon téléphone, etc.)
    let message = utility.formatSequelizeError(error);
    if (error.fields && typeof error.fields === 'object' && Object.keys(error.fields).length > 0) {
      const field = Object.keys(error.fields)[0];
      const value = error.fields[field];
      const labels = { phone_number: 'Ce numéro de téléphone', email: "Cet email", no_immatriculation: "Ce numéro d'immatriculation" };
      const label = labels[field] || 'Cette valeur';
      message = `${label} existe déjà${value ? ` (${value})` : ''}. Veuillez utiliser une autre valeur.`;
    }
    return res.status(400).json({ message });
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
 * GET /api/v1/employe  (root list – admin back-office)
 *
 * Liste paginée des employés d'un employeur pour le back-office admin.
 * Middleware: verifyToken
 * Query: employeurId (requis), search, sexe, type_contrat, is_active, is_imma, is_out, page, limit
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const employeurId = parseInt(req.query.employeurId);
    if (!employeurId || isNaN(employeurId)) {
      return res.status(400).json({ success: false, message: 'employeurId requis' });
    }

    const { page, limit, offset } = getPaginationParams(req);
    const where = { employeurId };

    // gender (M/F) mappé depuis le champ "gender" du modèle
    if (req.query.sexe) where.gender = req.query.sexe;
    if (req.query.type_contrat) where.type_contrat = req.query.type_contrat;
    if (req.query.is_active !== undefined) where.is_out = req.query.is_active === 'true' ? false : true;
    if (req.query.is_imma !== undefined) where.is_imma = req.query.is_imma === 'true';
    if (req.query.is_out !== undefined) where.is_out = req.query.is_out === 'true';

    if (req.query.search) {
      const s = `%${req.query.search}%`;
      where[Op.or] = [
        { first_name: { [Op.like]: s } },
        { last_name: { [Op.like]: s } },
        { matricule: { [Op.like]: s } },
        { no_immatriculation: { [Op.like]: s } },
      ];
    }

    const result = await Employe.findAndCountAll({
      where,
      include: [{ association: 'prefecture' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const totalPages = Math.ceil(result.count / limit);
    // Mappe les champs du modèle vers les noms attendus par le frontend
    const employes = result.rows.map((e) => {
      const p = e.toJSON();
      return {
        ...p,
        sexe: p.gender,
        poste: p.fonction,
        salaire_brut: p.salary ? Number(p.salary) : null,
        salaire_base: p.salary ? Number(p.salary) : null,
        date_naissance: p.date_of_birth,
        lieu_naissance: p.place_of_birth,
        nationalite: p.nationality,
        date_embauche: p.worked_date,
        adresse: p.adress,
        is_active: !p.is_out,
      };
    });
    return res.status(200).json({
      success: true,
      data: {
        employes,
        pagination: { page, limit, total: result.count, totalPages },
      },
    });
  } catch (error) {
    console.error('[EMPLOYE_LIST_ADMIN] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/v1/employe/stats
 *
 * Nombre d'employés : total, immatriculés, actifs, sortis, hommes, femmes.
 * Supporte deux modes :
 *   - Admin (verifyToken) : employeurId obligatoire en query param
 *   - Employeur (EmployeurToken) : employeurId tiré du token
 */
router.get('/stats', async (req, res) => {
  // Essaie d'abord verifyToken (admin back-office), sinon EmployeurToken
  const tryAdmin = () => new Promise((resolve) => {
    verifyToken(req, res, (err) => resolve(!err));
  });
  const tryEmployeur = () => new Promise((resolve) => {
    EmployeurToken(req, res, (err) => resolve(!err));
  });

  const isAdmin = await tryAdmin();
  if (!isAdmin) {
    const isEmployeur = await tryEmployeur();
    if (!isEmployeur) {
      return res.status(401).json({ success: false, message: 'Non autorisé' });
    }
  }

  try {
    let employeurId;
    if (req.query.employeurId) {
      employeurId = parseInt(req.query.employeurId);
    } else if (req.user?.user_id) {
      employeurId = req.user.user_id;
    }

    if (!employeurId || isNaN(employeurId)) {
      return res.status(400).json({ success: false, message: 'employeurId requis' });
    }

    const [total, immatricules, actifs, hommes, femmes] = await Promise.all([
      Employe.count({ where: { employeurId } }),
      Employe.count({ where: { employeurId, is_imma: true } }),
      Employe.count({ where: { employeurId, is_out: false } }),
      Employe.count({ where: { employeurId, gender: 'M' } }),
      Employe.count({ where: { employeurId, gender: 'F' } }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        immatricules,
        nonImmatricules: total - immatricules,
        actifs,
        inactifs: total - actifs,
        hommes,
        femmes,
      }
    });
  } catch (error) {
    console.error('[EMPLOYE_STATS] Error:', error);
    return res.status(500).json({ success: false, message: 'Erreur interne du serveur' });
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
    const { search, matricule, nom, prenom, immatriculation, telephone, includeInactive, immatriculesOnly } = req.query;

    const where = {
      employeurId: req.user.user_id
    };
    // Par défaut : uniquement les employés actifs (non sortis). Si includeInactive=true, on inclut aussi les inactifs.
    if (!includeInactive || String(includeInactive).toLowerCase() !== 'true') {
      where.is_out = false;
    }
    // Si immatriculesOnly=true (ex: page Fiche Employé), n'inclure que les employés immatriculés (is_imma true).
    if (immatriculesOnly && String(immatriculesOnly).toLowerCase() === 'true') {
      where.is_imma = true;
    }

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
// FICHE EMPLOYÉ — Détail, édition, sortie, famille, cotisations, carrière, prestations
// ============================================

/** Vérifie que l'employé appartient à l'employeur connecté */
const ensureEmployeBelongsToEmployeur = async (employeId, employeurId) => {
  const employe = await Employe.findByPk(employeId);
  if (!employe) return { error: 404, message: 'Employé non trouvé' };
  if (employe.employeurId !== employeurId) return { error: 403, message: 'Non autorisé' };
  return { employe };
};

/**
 * GET /api/v1/employe/:id
 * Détail d'un employé (fiche, modals) + quick stats (mois cotisés, total cotisations, enfants déclarés, années carrière).
 */
router.get('/:id', async (req, res) => {
  const tryAdmin = () => new Promise((resolve) => { verifyToken(req, res, (err) => resolve(!err)); });
  const tryEmployeur = () => new Promise((resolve) => { EmployeurToken(req, res, (err) => resolve(!err)); });
  const isAdmin = await tryAdmin();
  if (!isAdmin) {
    const isEmployeur = await tryEmployeur();
    if (!isEmployeur) return res.status(401).json({ message: 'Non autorisé' });
  }
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    if (!isAdmin) {
      const { error, message, employe: owned } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
      if (error) return res.status(error).json({ message });
      void owned;
    }
    const full = await Employe.findByPk(id, {
      include: [
        { association: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation', 'adresse'] },
        { association: 'prefecture' }
      ]
    });
    if (!full) return res.status(404).json({ message: 'Employé non trouvé' });

    const decls = await Demploye.findAll({
      where: { employeId: id },
      include: [{ model: CotisationEmployeur, as: 'cotisation_employeur', attributes: ['id', 'is_paid'] }]
    });
    const declsPaid = decls.filter(d => (d.toJSON ? d.toJSON() : d).cotisation_employeur?.is_paid);
    const total_mois_cotises = declsPaid.length;
    const totalCotisationsNum = declsPaid.reduce((s, d) => s + Number(d.total_cotisation || 0), 0);
    const total_cotisations = totalCotisationsNum.toLocaleString('fr-FR') + ' GNF';

    const enfants_declares = await Enfant.count({ where: { employeId: id } });

    const carrieres = await Carer.findAll({
      where: { employeId: id },
      attributes: ['date_entre', 'date_sortie']
    });
    let annees_carriere = 0;
    if (carrieres.length) {
      const entrees = carrieres.map(c => c.date_entre).filter(Boolean).map(d => new Date(d).getTime());
      const sorties = carrieres.map(c => c.date_sortie ? new Date(c.date_sortie).getTime() : Date.now());
      if (entrees.length) {
        const firstDate = new Date(Math.min(...entrees));
        const lastDate = new Date(Math.max(...sorties));
        annees_carriere = Math.max(0, Math.floor((lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000)));
      }
    }

    const raw = full.toJSON ? full.toJSON() : full;
    const avatar = raw.avatar || 'uploads/user.jpeg';
    const avatar_url = avatar.startsWith('http') ? avatar : '/' + avatar.replace(/^\/+/, '');
    const payload = {
      ...raw,
      avatar,
      avatar_url,
      total_mois_cotises,
      total_cotisations,
      enfants_declares,
      annees_carriere
    };
    console.log('[EMPLOYE_GET_ID] response stats', { id, total_mois_cotises, total_cotisations, enfants_declares, annees_carriere });
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[EMPLOYE_GET_ID]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * PATCH /api/v1/employe/:id/avatar
 * Mise à jour de la photo de l'employé (multipart/form-data, champ avatar ou photo).
 * Réponse : 200 avec objet employé mis à jour + avatar_url.
 */
router.patch('/:id/avatar', async (req, res, next) => {
  const tryAdmin = () => new Promise((resolve) => { verifyToken(req, res, (err) => resolve(!err)); });
  const tryEmployeur = () => new Promise((resolve) => { EmployeurToken(req, res, (err) => resolve(!err)); });
  const isAdmin = await tryAdmin();
  if (!isAdmin) {
    const isEmployeur = await tryEmployeur();
    if (!isEmployeur) return res.status(401).json({ message: 'Non autorisé' });
  }
  req._isAdmin = isAdmin;
  next();
}, employeUpload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'photo', maxCount: 1 }]), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    let employe = await Employe.findByPk(id);
    if (!employe) return res.status(404).json({ message: 'Employé non trouvé' });
    if (!req._isAdmin) {
      const { error, message } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
      if (error) return res.status(error).json({ message });
    }
    const files = req.files || {};
    const file = (files['avatar'] && files['avatar'][0]) || (files['photo'] && files['photo'][0]);
    if (!file) return res.status(400).json({ message: 'Fichier requis (champ avatar ou photo en multipart/form-data)' });
    const relativePath = 'uploads/' + path.basename(file.path);
    await employe.update({ avatar: relativePath });
    const updated = await Employe.findByPk(employe.id, {
      include: [
        { association: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation'] },
        { association: 'prefecture' }
      ]
    });
    const raw = updated.toJSON ? updated.toJSON() : updated;
    const avatarPath = raw.avatar || 'uploads/user.jpeg';
    const avatar_url = avatarPath.startsWith('http') ? avatarPath : '/' + avatarPath.replace(/^\/+/, '');
    return res.status(200).json({ ...raw, avatar: avatarPath, avatar_url });
  } catch (err) {
    console.error('[EMPLOYE_PATCH_AVATAR]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * PATCH /api/v1/employe/:id
 * Mise à jour des champs employé (modal édition).
 */
router.patch('/:id', async (req, res) => {
  const tryAdmin = () => new Promise((resolve) => { verifyToken(req, res, (err) => resolve(!err)); });
  const tryEmployeur = () => new Promise((resolve) => { EmployeurToken(req, res, (err) => resolve(!err)); });
  const isAdmin = await tryAdmin();
  if (!isAdmin) {
    const isEmployeur = await tryEmployeur();
    if (!isEmployeur) return res.status(401).json({ message: 'Non autorisé' });
  }
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    let employe = await Employe.findByPk(id);
    if (!employe) return res.status(404).json({ message: 'Employé non trouvé' });
    if (!isAdmin) {
      const { error, message } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
      if (error) return res.status(error).json({ message });
    }
    if (employe.is_imma) {
      return res.status(403).json({ message: 'Impossible de modifier un employé validé.' });
    }
    const allowed = ['first_name', 'last_name', 'email', 'phone_number', 'matricule', 'fonction', 'adress', 'date_of_birth', 'place_of_birth', 'nationality', 'situation_matrimoniale', 'ville', 'prefectureId', 'type_contrat', 'salary', 'worked_date', 'identity_number', 'father_first_name', 'father_last_name', 'mother_first_name', 'mother_last_name', 'father_date_of_birth', 'mother_date_of_birth', 'father_statut', 'mother_statut'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    await employe.update(updates);
    const updated = await Employe.findByPk(employe.id, {
      include: [
        { association: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation'] },
        { association: 'prefecture' }
      ]
    });
    return res.status(200).json(updated);
  } catch (err) {
    console.error('[EMPLOYE_PATCH_ID]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * POST /api/v1/employe/:id/sortie
 * Déclarer une sortie (is_out = true, out_date, etc.).
 */
router.post('/:id/sortie', EmployeurToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { error, message, employe } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
    if (error) return res.status(error).json({ message });
    const employeurId = req.user.user_id;
    const { out_date, last_work_day, exit_reason, notice_period, notes } = req.body;
    const outDate = out_date ? new Date(out_date) : new Date();

    await employe.update({
      employeurId: null,
      is_out: true,
      out_date: outDate,
      exit_reason: exit_reason || null,
      notice_period: notice_period || null,
      exit_notes: notes || null
    });

    // Mettre à jour la carrière (table carriers) : date_sortie + motif/préavis/notes pour cet employeur
    const carriere = await Carer.findOne({
      where: { employeId: id, employeurId }
    });
    if (carriere) {
      carriere.date_sortie = outDate;
      carriere.exit_reason = exit_reason || null;
      carriere.notice_period = notice_period || null;
      carriere.exit_notes = notes || null;
      await carriere.save();
    }

    const updated = await Employe.findByPk(employe.id, {
      include: [
        { association: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation'] },
        { association: 'prefecture' }
      ]
    });
    return res.status(200).json(updated);
  } catch (err) {
    console.error('[EMPLOYE_SORTIE]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/employe/:id/famille
 * Conjoints (avec enfants) + parents.
 */
router.get('/:id/famille', EmployeurToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { error, message, employe } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
    if (error) return res.status(error).json({ message });
    const conjoints = await Conjoint.findAll({
      where: {
        employeId: id,
        [Op.or]: [{ statut_dossier: null }, { statut_dossier: { [Op.ne]: 'supprime' } }]
      },
      include: [{ model: Enfant, as: 'enfants', required: false }],
      order: [['ordre', 'ASC']]
    });
    const spouses = conjoints.map(c => {
      const conv = c.toJSON ? c.toJSON() : c;
      const enfantsActifs = (conv.enfants || []).filter(e => e.statut_dossier !== 'supprime');
      return {
        id: conv.id,
        nom: conv.last_name,
        prenom: conv.first_name,
        date_naissance: conv.date_of_birth,
        lieu_naissance: conv.place_of_birth,
        profession: conv.profession,
        type_union: conv.type_union || 'mariage',
        date_union: conv.date_mariage,
        statut: conv.statut || 'actif',
        statut_dossier: conv.statut_dossier || 'en_cours_validation',
        certificat_mariage: (conv.civil_file && String(conv.civil_file).trim()) ? (conv.civil_file.startsWith('http') ? conv.civil_file : '/' + conv.civil_file.replace(/^\/+/, '')) : null,
        photo: conv.picture ? (conv.picture.startsWith('http') ? conv.picture : '/' + conv.picture.replace(/^\/+/, '')) : null,
        children: enfantsActifs.map(e => ({
          id: e.id,
          nom: e.last_name,
          prenom: e.first_name,
          date_naissance: e.date_of_birth,
          lieu_naissance: e.place_of_birth,
          sexe: e.gender,
          statut: e.statut || (e.date_of_birth && (new Date().getFullYear() - new Date(e.date_of_birth).getFullYear() >= 18) ? 'majeur' : 'a_charge'),
          statut_dossier: e.statut_dossier || 'en_cours_validation',
          spouse_id: conv.id,
          photo: e.picture ? (e.picture.startsWith('http') ? e.picture : '/' + e.picture.replace(/^\/+/, '')) : null,
          extrait_naissance: (e.extrait_file && String(e.extrait_file).trim()) ? (e.extrait_file.startsWith('http') ? e.extrait_file : '/' + e.extrait_file.replace(/^\/+/, '')) : null
        }))
      };
    });
    const parents = {
      father: employe.father_last_name || employe.father_first_name ? { nom: employe.father_last_name, prenom: employe.father_first_name, date_naissance: employe.father_date_of_birth, statut: employe.father_statut || 'vivant' } : null,
      mother: employe.mother_last_name || employe.mother_first_name ? { nom: employe.mother_last_name, prenom: employe.mother_first_name, date_naissance: employe.mother_date_of_birth, statut: employe.mother_statut || 'vivant' } : null
    };
    return res.status(200).json({ spouses, parents });
  } catch (err) {
    console.error('[EMPLOYE_FAMILLE]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * PATCH /api/v1/employe/:id/famille
 * Accepte multipart/form-data : champ "famille" (JSON string) + fichiers optionnels.
 * Champs FormData : famille (JSON) | photo_conjoint_<spouseId> | certificat_mariage_<spouseId> | photo_enfant_<childId> | extrait_enfant_<childId>.
 * spouseId / childId = id du conjoint/enfant dans le JSON famille. Un seul fichier par champ.
 */
router.patch('/:id/famille', EmployeurToken, familleUpload.any(), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { error, message, employe } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
    if (error) return res.status(error).json({ message });

    const contentType = req.headers['content-type'] || '';
    console.log('[PATCH_FAMILLE] Content-Type reçu:', contentType);
    if (contentType.indexOf('multipart/form-data') !== 0) {
      console.log('[PATCH_FAMILLE] Attention: pas multipart — les fichiers ne seront pas reçus. Le front doit envoyer FormData avec Content-Type multipart/form-data.');
    }

    let body = req.body || {};
    // Log contenu brut du FormData reçu du front
    const formDataKeys = Object.keys(body);
    const formDataPreview = formDataKeys.reduce((acc, k) => {
      const v = body[k];
      if (k === 'famille' && typeof v === 'string') acc[k] = `[string length ${v.length}]`;
      else if (k === 'famille' && typeof v === 'object') acc[k] = '[object]';
      else acc[k] = v;
      return acc;
    }, {});
    console.log('[PATCH_FAMILLE] FormData body (champs):', formDataKeys);
    console.log('[PATCH_FAMILLE] FormData body (aperçu):', formDataPreview);
    console.log('[PATCH_FAMILLE] FormData files:', (req.files || []).map(f => ({
      fieldname: f.fieldname,
      originalname: f.originalname,
      size: f.size,
      path: f.path
    })));

    if (typeof body.famille === 'string') {
      try {
        body = JSON.parse(body.famille);
      } catch (e) {
        return res.status(400).json({ message: 'Champ famille invalide (JSON attendu)' });
      }
    } else if (body.famille && typeof body.famille === 'object') {
      body = body.famille;
    }

    const files = req.files || [];
    const toRel = (p) => (p && path.basename(p)) ? 'uploads/' + path.basename(p) : null;
    // N'accepter du body que les chemins qu'on a nous-mêmes générés (uploads/...) — pas de placeholder type /enfant/user.jpeg
    const isOwnUploadPath = (val) => val && typeof val === 'string' && !val.startsWith('data:') && val.replace(/^\/+/, '').trim().startsWith('uploads/');
    const bodyPathOrNull = (val) => (isOwnUploadPath(val) ? val.replace(/^\/+/, '').trim() : null);
    const photoConjointMap = {};
    const certificatMariageMap = {};
    const photoEnfantMap = {};
    const extraitEnfantMap = {};
    files.forEach(f => {
      const rel = toRel(f.path);
      if (f.fieldname.startsWith('photo_conjoint_')) {
        const key = f.fieldname.slice('photo_conjoint_'.length);
        photoConjointMap[key] = rel;
      } else if (f.fieldname.startsWith('certificat_mariage_')) {
        const key = f.fieldname.slice('certificat_mariage_'.length);
        certificatMariageMap[key] = rel;
      } else if (f.fieldname.startsWith('photo_enfant_')) {
        const key = f.fieldname.slice('photo_enfant_'.length);
        photoEnfantMap[key] = rel;
      } else if (f.fieldname.startsWith('extrait_enfant_')) {
        const key = f.fieldname.slice('extrait_enfant_'.length);
        extraitEnfantMap[key] = rel;
      }
    });

    const spousesBody = Array.isArray(body.spouses) ? body.spouses : [];
    const parentsBody = body.parents || {};

    // Log ce que le front envoie pour l'enregistrement des enfants
    const childrenPayload = spousesBody.map((s, idx) => ({
      conjointIndex: idx,
      conjointId: s.id,
      children: (s.children || []).map((ch, j) => ({
        index: j,
        id: ch.id,
        nom: ch.nom,
        prenom: ch.prenom,
        date_naissance: ch.date_naissance,
        lieu_naissance: ch.lieu_naissance,
        sexe: ch.sexe,
        statut: ch.statut,
        statut_dossier: ch.statut_dossier,
        photo: ch.photo,
        extrait_naissance: ch.extrait_naissance
      }))
    }));
    const childFileFields = (req.files || []).filter(f => f.fieldname.startsWith('photo_enfant_') || f.fieldname.startsWith('extrait_enfant_')).map(f => ({ fieldname: f.fieldname, path: f.path }));
    console.log('[PATCH_FAMILLE] Enfants envoyés par le front:', JSON.stringify(childrenPayload, null, 2));
    console.log('[PATCH_FAMILLE] Fichiers enfants (FormData):', childFileFields);
    console.log('[PATCH_FAMILLE] Maps photo_enfant / extrait_enfant:', { photoEnfantMap, extraitEnfantMap });

    const existingConjoints = await Conjoint.findAll({ where: { employeId: id }, include: [{ model: Enfant, as: 'enfants' }] }); // tous (y compris supprimés) pour mise à jour
    const existingConjointIds = new Set(existingConjoints.map(c => c.id));
    const bodySpouseIds = new Set(spousesBody.filter(s => s.id != null).map(s => parseInt(s.id, 10)).filter(n => !isNaN(n)));

    const spouseIdsByIndex = [];
    for (let i = 0; i < spousesBody.length; i++) {
      const s = spousesBody[i];
      const nom = (s.nom || '').toString().trim();
      const prenom = (s.prenom || '').toString().trim();
      const dateNaissance = s.date_naissance ? new Date(s.date_naissance) : null;
      const dateUnion = s.date_union ? new Date(s.date_union) : new Date();
      if (!nom || !prenom) return res.status(400).json({ message: 'Conjoint : nom et prenom obligatoires' });
      const conjointPhoto = photoConjointMap[String(s.id)] || photoConjointMap['new_' + i];
      const conjointCertificat = certificatMariageMap[String(s.id)] || certificatMariageMap['new_' + i];
      const pictureVal = conjointPhoto || bodyPathOrNull(s.photo);
      const civilFileVal = conjointCertificat || bodyPathOrNull(s.certificat_mariage);

      if (s.id != null && existingConjointIds.has(parseInt(s.id, 10))) {
        const conj = existingConjoints.find(c => c.id === parseInt(s.id, 10));
        if (conj) {
          const conjUpdates = {
            last_name: nom,
            first_name: prenom,
            place_of_birth: (s.lieu_naissance || '').toString() || null,
            profession: (s.profession || '').toString(),
            type_union: (s.type_union || 'mariage').toString(),
            date_mariage: dateUnion,
            statut: (s.statut || 'actif').toString(),
            civil_file: civilFileVal || null,
            ...((conjointPhoto || bodyPathOrNull(s.photo)) && { picture: pictureVal || null })
          };
          if (dateNaissance) conjUpdates.date_of_birth = dateNaissance;
          if (s.statut_dossier && ['en_cours_validation', 'valide', 'supprime'].includes(s.statut_dossier)) conjUpdates.statut_dossier = s.statut_dossier;
          await conj.update(conjUpdates);
          spouseIdsByIndex[i] = conj.id;
        }
      } else {
        const codeConjoint = 'CONJ-' + id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        const statutDossier = (s.statut_dossier && ['en_cours_validation', 'valide', 'supprime'].includes(s.statut_dossier)) ? s.statut_dossier : 'en_cours_validation';
        const created = await Conjoint.create({
          employeId: id,
          last_name: nom,
          first_name: prenom,
          date_of_birth: dateNaissance || new Date(),
          place_of_birth: (s.lieu_naissance || '').toString() || null,
          profession: (s.profession || '').toString(),
          type_union: (s.type_union || 'mariage').toString(),
          date_mariage: dateUnion,
          statut: (s.statut || 'actif').toString(),
          civil_file: civilFileVal || null,
          picture: pictureVal || null,
          code_conjoint: codeConjoint,
          gender: 'F',
          ordre: i,
          statut_dossier: statutDossier
        });
        spouseIdsByIndex[i] = created.id;
      }
    }

    const idsToKeep = new Set(spouseIdsByIndex);
    for (const c of existingConjoints) {
      if (!idsToKeep.has(c.id)) {
        await Enfant.update({ statut_dossier: 'supprime' }, { where: { conjointId: c.id } });
        await c.update({ statut_dossier: 'supprime' });
      }
    }

    for (let i = 0; i < spousesBody.length; i++) {
      const conjointId = spouseIdsByIndex[i];
      const childrenBody = Array.isArray(spousesBody[i].children) ? spousesBody[i].children : [];
      const existingEnfants = await Enfant.findAll({ where: { conjointId, employeId: id } }); // tous pour comparer
      const existingEnfantIds = new Set(existingEnfants.map(e => e.id));
      const bodyChildIds = new Set(childrenBody.filter(ch => ch.id != null).map(ch => parseInt(ch.id, 10)).filter(n => !isNaN(n)));

      for (let j = 0; j < childrenBody.length; j++) {
        const ch = childrenBody[j];
        const nom = (ch.nom || '').toString().trim();
        const prenom = (ch.prenom || '').toString().trim();
        const dateNaissance = ch.date_naissance ? new Date(ch.date_naissance) : null;
        if (!nom || !prenom) return res.status(400).json({ message: 'Enfant : nom et prenom obligatoires' });
        const sexe = (ch.sexe === 'F' || ch.sexe === 'M') ? ch.sexe : 'M';
        const statut = (ch.statut || 'a_charge').toString();
        const childPhoto = ch.id != null ? (photoEnfantMap[String(ch.id)] || bodyPathOrNull(ch.photo)) : (photoEnfantMap['new_' + i + '_' + j] || bodyPathOrNull(ch.photo));
        const childExtrait = ch.id != null ? (extraitEnfantMap[String(ch.id)] || bodyPathOrNull(ch.extrait_naissance)) : (extraitEnfantMap['new_' + i + '_' + j] || bodyPathOrNull(ch.extrait_naissance));
        if (ch.id != null && existingEnfantIds.has(parseInt(ch.id, 10))) {
          const enf = existingEnfants.find(e => e.id === parseInt(ch.id, 10));
          if (enf) {
            const enfUpdates = { last_name: nom, first_name: prenom, place_of_birth: (ch.lieu_naissance || '').toString() || null, gender: sexe, statut, conjointId, employeId: id };
            if (dateNaissance) enfUpdates.date_of_birth = dateNaissance;
            if (ch.statut_dossier && ['en_cours_validation', 'valide', 'supprime'].includes(ch.statut_dossier)) enfUpdates.statut_dossier = ch.statut_dossier;
            if (photoEnfantMap[String(ch.id)] !== undefined || bodyPathOrNull(ch.photo) !== null) enfUpdates.picture = childPhoto || null;
            if (extraitEnfantMap[String(ch.id)] !== undefined || bodyPathOrNull(ch.extrait_naissance) !== null) enfUpdates.extrait_file = childExtrait || null;
            await enf.update(enfUpdates);
          }
        } else {
          const enfStatutDossier = (ch.statut_dossier && ['en_cours_validation', 'valide', 'supprime'].includes(ch.statut_dossier)) ? ch.statut_dossier : 'en_cours_validation';
          await Enfant.create({
            employeId: id,
            conjointId,
            last_name: nom,
            first_name: prenom,
            date_of_birth: dateNaissance || new Date(),
            place_of_birth: (ch.lieu_naissance || '').toString() || null,
            gender: sexe,
            statut,
            ordre: j,
            statut_dossier: enfStatutDossier,
            picture: childPhoto || null,
            extrait_file: childExtrait || null
          });
        }
      }
      for (const e of existingEnfants) {
        if (!bodyChildIds.has(e.id)) await e.update({ statut_dossier: 'supprime' });
      }
    }

    const parentFather = parentsBody.father;
    const parentMother = parentsBody.mother;
    const employeUpdates = {};
    if (parentFather && typeof parentFather === 'object') {
      if (parentFather.nom != null) employeUpdates.father_last_name = parentFather.nom;
      if (parentFather.prenom != null) employeUpdates.father_first_name = parentFather.prenom;
      if (parentFather.date_naissance != null) employeUpdates.father_date_of_birth = parentFather.date_naissance;
      if (parentFather.statut != null) employeUpdates.father_statut = parentFather.statut;
    }
    if (parentMother && typeof parentMother === 'object') {
      if (parentMother.nom != null) employeUpdates.mother_last_name = parentMother.nom;
      if (parentMother.prenom != null) employeUpdates.mother_first_name = parentMother.prenom;
      if (parentMother.date_naissance != null) employeUpdates.mother_date_of_birth = parentMother.date_naissance;
      if (parentMother.statut != null) employeUpdates.mother_statut = parentMother.statut;
    }
    if (Object.keys(employeUpdates).length) await employe.update(employeUpdates);

    const conjointsAfter = await Conjoint.findAll({
      where: {
        employeId: id,
        [Op.or]: [{ statut_dossier: null }, { statut_dossier: { [Op.ne]: 'supprime' } }]
      },
      include: [{ model: Enfant, as: 'enfants', required: false }],
      order: [['ordre', 'ASC']]
    });
    const spouses = conjointsAfter.map(c => {
      const conv = c.toJSON ? c.toJSON() : c;
      const enfantsActifs = (conv.enfants || []).filter(e => e.statut_dossier !== 'supprime');
      return {
        id: conv.id,
        nom: conv.last_name,
        prenom: conv.first_name,
        date_naissance: conv.date_of_birth,
        lieu_naissance: conv.place_of_birth,
        profession: conv.profession,
        type_union: conv.type_union || 'mariage',
        date_union: conv.date_mariage,
        statut: conv.statut || 'actif',
        statut_dossier: conv.statut_dossier || 'en_cours_validation',
        certificat_mariage: (conv.civil_file && String(conv.civil_file).trim()) ? (conv.civil_file.startsWith('http') ? conv.civil_file : '/' + conv.civil_file.replace(/^\/+/, '')) : null,
        photo: conv.picture ? (conv.picture.startsWith('http') ? conv.picture : '/' + conv.picture.replace(/^\/+/, '')) : null,
        children: enfantsActifs.map(e => ({
          id: e.id,
          nom: e.last_name,
          prenom: e.first_name,
          date_naissance: e.date_of_birth,
          lieu_naissance: e.place_of_birth,
          sexe: e.gender,
          statut: e.statut || (e.date_of_birth && (new Date().getFullYear() - new Date(e.date_of_birth).getFullYear() >= 18) ? 'majeur' : 'a_charge'),
          statut_dossier: e.statut_dossier || 'en_cours_validation',
          spouse_id: conv.id,
          photo: e.picture ? (e.picture.startsWith('http') ? e.picture : '/' + e.picture.replace(/^\/+/, '')) : null,
          extrait_naissance: (e.extrait_file && String(e.extrait_file).trim()) ? (e.extrait_file.startsWith('http') ? e.extrait_file : '/' + e.extrait_file.replace(/^\/+/, '')) : null
        }))
      };
    });
    const emp = await Employe.findByPk(id, { attributes: ['father_first_name', 'father_last_name', 'father_date_of_birth', 'father_statut', 'mother_first_name', 'mother_last_name', 'mother_date_of_birth', 'mother_statut'] });
    const parents = {
      father: emp && (emp.father_last_name || emp.father_first_name) ? { nom: emp.father_last_name, prenom: emp.father_first_name, date_naissance: emp.father_date_of_birth, statut: emp.father_statut || 'vivant' } : null,
      mother: emp && (emp.mother_last_name || emp.mother_first_name) ? { nom: emp.mother_last_name, prenom: emp.mother_first_name, date_naissance: emp.mother_date_of_birth, statut: emp.mother_statut || 'vivant' } : null
    };
    return res.status(200).json({ spouses, parents });
  } catch (err) {
    console.error('[EMPLOYE_FAMILLE_PATCH]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/employe/:id/cotisations/pdf
 * Génère le PDF de l'historique des cotisations (toutes périodes).
 */
router.get('/:id/cotisations/pdf', EmployeurToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { error, message, employe } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
    if (error) return res.status(error).json({ message });
    const declarations = await Demploye.findAll({
      where: { employeId: id },
      include: [{ model: CotisationEmployeur, as: 'cotisation_employeur', attributes: ['id', 'is_paid'] }],
      order: [['year', 'ASC'], ['periode', 'ASC']]
    });
    let totalMois = 0;
    let totalCotisations = 0;
    const fullData = declarations.map(d => {
      const decl = d.toJSON ? d.toJSON() : d;
      const cot = decl.cotisation_employeur || {};
      const paid = !!cot.is_paid;
      if (paid) {
        totalMois += 1;
        totalCotisations += Number(decl.total_cotisation || 0);
      }
      const periodLabel = decl.periode && decl.year ? `${decl.periode} ${decl.year}` : `${decl.year}`;
      return {
        periode: periodLabel,
        salaire_brut: decl.salary_brut,
        cotisation_salariale: decl.cotisation_employe,
        cotisation_patronale: decl.cotisation_emplyeur,
        total: decl.total_cotisation,
        statut: paid ? 'paye' : 'en_attente'
      };
    });
    const paidDeclarations = declarations.filter(d => (d.toJSON ? d.toJSON() : d).cotisation_employeur?.is_paid);
    const lastDecl = paidDeclarations.length ? paidDeclarations[paidDeclarations.length - 1] : null;
    const lastLabel = lastDecl && lastDecl.periode && lastDecl.year ? `${lastDecl.periode} ${lastDecl.year}` : (lastDecl && lastDecl.year ? String(lastDecl.year) : null);
    const summary = {
      total_mois_cotises: totalMois,
      total_cotisations: totalCotisations,
      derniere_cotisation: lastLabel
    };
    const employeData = employe.toJSON ? employe.toJSON() : employe;
    const pdfBuffer = await generateCotisationsPdfBuffer(employeData, summary, fullData);
    const nom = (employeData.last_name || 'cotisations').replace(/\s+/g, '-');
    const filename = `cotisations-${nom}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('[EMPLOYE_COTISATIONS_PDF]', err);
    return res.status(500).json({ message: 'Erreur lors de la génération du PDF des cotisations' });
  }
});

/**
 * GET /api/v1/employe/:id/cotisations
 * Historique des cotisations (summary + data par période).
 * Query optionnels : page (défaut 1), limit (ex. 10) — pagination côté serveur.
 */
router.get('/:id/cotisations', EmployeurToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { error, message } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
    if (error) return res.status(error).json({ message });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));

    const declarations = await Demploye.findAll({
      where: { employeId: id },
      include: [{ model: CotisationEmployeur, as: 'cotisation_employeur', attributes: ['id', 'is_paid'] }],
      order: [['year', 'ASC'], ['periode', 'ASC']]
    });
    let totalMois = 0;
    let totalCotisations = 0;
    const fullData = declarations.map(d => {
      const decl = d.toJSON ? d.toJSON() : d;
      const cot = decl.cotisation_employeur || {};
      const paid = !!cot.is_paid;
      if (paid) {
        totalMois += 1;
        totalCotisations += Number(decl.total_cotisation || 0);
      }
      const periodLabel = decl.periode && decl.year ? `${decl.periode} ${decl.year}` : `${decl.year}`;
      return {
        periode: periodLabel,
        salaire_brut: decl.salary_brut,
        cotisation_salariale: decl.cotisation_employe,
        cotisation_patronale: decl.cotisation_emplyeur,
        total: decl.total_cotisation,
        statut: paid ? 'paye' : 'en_attente'
      };
    });
    const total = fullData.length;
    const offset = (page - 1) * limit;
    const data = fullData.slice(offset, offset + limit);

    const paidDeclarations = declarations.filter(d => (d.toJSON ? d.toJSON() : d).cotisation_employeur?.is_paid);
    const years = paidDeclarations.length ? paidDeclarations.map(d => d.year).filter(Boolean) : [];
    const minYear = years.length ? Math.min(...years) : null;
    const maxYear = years.length ? Math.max(...years) : null;
    const lastDecl = paidDeclarations.length ? paidDeclarations[paidDeclarations.length - 1] : null;
    const lastLabel = lastDecl && lastDecl.periode && lastDecl.year ? `${lastDecl.periode} ${lastDecl.year}` : (lastDecl && lastDecl.year ? String(lastDecl.year) : null);
    return res.status(200).json({
      summary: {
        total_mois_cotises: totalMois,
        total_cotisations: totalCotisations,
        periode_debut: minYear ? String(minYear) : null,
        periode_fin: maxYear ? String(maxYear) : null,
        derniere_cotisation: lastLabel
      },
      data,
      pagination: { total, page, limit }
    });
  } catch (err) {
    console.error('[EMPLOYE_COTISATIONS]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/employe/:id/career
 * Relevé de carrière par employeur (avec postes = Carer).
 */
router.get('/:id/career', EmployeurToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { error, message } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
    if (error) return res.status(error).json({ message });
    const carrieres = await Carer.findAll({
      where: { employeId: id },
      include: [{ association: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation', 'adresse', 'description'] }],
      order: [['date_entre', 'ASC']]
    });
    let totalMois = 0;
    let totalCotSalariale = 0;
    let totalCotPatronale = 0;
    const data = await Promise.all(carrieres.map(async (car) => {
      const empId = car.employeurId;
      const decls = await Demploye.findAll({
        where: { employeId: id, employeurId: empId },
        include: [{ model: CotisationEmployeur, as: 'cotisation_employeur', attributes: ['id', 'is_paid'] }]
      });
      const declsPaid = decls.filter(d => (d.toJSON ? d.toJSON() : d).cotisation_employeur?.is_paid);
      const moisCotises = declsPaid.length;
      const totalSalaireBrut = declsPaid.reduce((s, d) => s + Number(d.salary_brut || 0), 0);
      const cotSal = declsPaid.reduce((s, d) => s + Number(d.cotisation_employe || 0), 0);
      const cotPat = declsPaid.reduce((s, d) => s + Number(d.cotisation_emplyeur || 0), 0);
      totalMois += moisCotises;
      totalCotSalariale += cotSal;
      totalCotPatronale += cotPat;
      const emp = car.employeur || {};
      const dateFinLabel = car.date_sortie ? null : 'En cours';
      const postes = [{
        id: car.id,
        titre: car.titre || car.employeur?.description || 'Poste',
        date_debut: car.date_entre,
        date_fin: car.date_sortie,
        duree: car.date_entre && car.date_sortie ? `${Math.round((new Date(car.date_sortie) - new Date(car.date_entre)) / (1000 * 60 * 60 * 24 * 30))} mois` : null,
        salaire_brut: car.salaire,
        departement: car.departement,
        type_contrat: car.type_contrat,
        responsabilites: car.responsabilites
      }];
      return {
        id: car.id,
        employeur: emp.raison_sociale || '',
        numero_employeur: emp.no_immatriculation || '',
        adresse: emp.adresse || '',
        secteur_activite: emp.description || '',
        date_debut: car.date_entre,
        date_fin: car.date_sortie,
        date_fin_label: dateFinLabel || (car.date_sortie ? undefined : 'En cours'),
        mois_cotises: moisCotises,
        total_salaire_brut: totalSalaireBrut,
        cotisation_salariale: cotSal,
        cotisation_patronale: cotPat,
        total_cotisations: cotSal + cotPat,
        statut: car.date_sortie ? 'termine' : 'actif',
        postes
      };
    }));
    return res.status(200).json({
      summary: {
        nombre_employeurs: carrieres.length,
        total_mois_cotises: totalMois,
        total_cotisation_salariale: totalCotSalariale,
        total_cotisation_patronale: totalCotPatronale
      },
      data
    });
  } catch (err) {
    console.error('[EMPLOYE_CAREER]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/employe/:employeeId/career/:employerId
 * Détail d'un épisode de carrière chez un employeur.
 */
router.get('/:employeeId/career/:employerId', EmployeurToken, async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const employerId = parseInt(req.params.employerId);
    if (isNaN(employeeId) || isNaN(employerId)) return res.status(400).json({ message: 'ID invalide' });
    const { error, message } = await ensureEmployeBelongsToEmployeur(employeeId, req.user.user_id);
    if (error) return res.status(error).json({ message });
    const car = await Carer.findOne({
      where: { employeId: employeeId, employeurId: employerId },
      include: [{ association: 'employeur' }]
    });
    if (!car) return res.status(404).json({ message: 'Épisode de carrière non trouvé' });
    const decls = await Demploye.findAll({
      where: { employeId: employeeId, employeurId: employerId },
      include: [{ model: CotisationEmployeur, as: 'cotisation_employeur', attributes: ['id', 'is_paid'] }]
    });
    const declsPaid = decls.filter(d => (d.toJSON ? d.toJSON() : d).cotisation_employeur?.is_paid);
    const emp = car.employeur || {};
    const postes = [{
      id: car.id,
      titre: car.titre || 'Poste',
      date_debut: car.date_entre,
      date_fin: car.date_sortie,
      duree: car.date_entre && car.date_sortie ? `${Math.round((new Date(car.date_sortie) - new Date(car.date_entre)) / (1000 * 60 * 60 * 24 * 30))} mois` : null,
      salaire_brut: car.salaire,
      departement: car.departement,
      type_contrat: car.type_contrat,
      responsabilites: car.responsabilites
    }];
    const cotisations = decls.map(d => {
      const decl = d.toJSON ? d.toJSON() : d;
      const cot = decl.cotisation_employeur || {};
      const periodLabel = decl.periode && decl.year ? `${decl.periode} ${decl.year}` : `${decl.year}`;
      return {
        periode: periodLabel,
        salaire_brut: decl.salary_brut,
        cotisation_salariale: decl.cotisation_employe,
        cotisation_patronale: decl.cotisation_emplyeur,
        total: decl.total_cotisation,
        statut: cot.is_paid ? 'paye' : 'en_attente'
      };
    });
    return res.status(200).json({
      id: car.id,
      employeur: emp.raison_sociale || '',
      numero_employeur: emp.no_immatriculation || '',
      adresse: emp.adresse || '',
      secteur_activite: emp.description || '',
      date_debut: car.date_entre,
      date_fin: car.date_sortie,
      mois_cotises: declsPaid.length,
      total_salaire_brut: declsPaid.reduce((s, d) => s + Number(d.salary_brut || 0), 0),
      cotisation_salariale: declsPaid.reduce((s, d) => s + Number(d.cotisation_employe || 0), 0),
      cotisation_patronale: declsPaid.reduce((s, d) => s + Number(d.cotisation_emplyeur || 0), 0),
      total_cotisations: declsPaid.reduce((s, d) => s + Number(d.total_cotisation || 0), 0),
      statut: car.date_sortie ? 'termine' : 'actif',
      postes,
      cotisations
    });
  } catch (err) {
    console.error('[EMPLOYE_CAREER_EMPLOYER]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/employe/:id/card/pdf
 * Génère et renvoie le PDF de la carte d'assuré (binaire). Design eCNSS.
 */
router.get('/:id/card/pdf', EmployeurToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { error, message, employe } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
    if (error) return res.status(error).json({ message });
    const full = await Employe.findByPk(employe.id, { attributes: ['id', 'first_name', 'last_name', 'no_immatriculation', 'avatar', 'immatriculation_date', 'worked_date', 'createdAt'] });
    if (!full) return res.status(404).json({ message: 'Employé non trouvé' });
    const data = full.toJSON ? full.toJSON() : full;
    const pdfBuffer = await generateCarteAssurePdfBuffer(data);
    const nom = (data.last_name || 'assure').replace(/\s+/g, '-');
    const filename = `carte-assure-${nom}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('[EMPLOYE_CARD_PDF]', err);
    return res.status(500).json({ message: 'Erreur lors de la génération de la carte' });
  }
});

/**
 * GET /api/v1/employe/:id/fiche/pdf
 * Génère le PDF de la fiche employé (design modal détail).
 */
router.get('/:id/fiche/pdf', EmployeurToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { error, message, employe } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
    if (error) return res.status(error).json({ message });
    const full = await Employe.findByPk(employe.id, {
      include: [{ association: 'prefecture', attributes: ['id', 'name', 'code'] }]
    });
    if (!full) return res.status(404).json({ message: 'Employé non trouvé' });
    const data = full.toJSON ? full.toJSON() : full;
    const pdfBuffer = await generateFicheEmployePdfBuffer(data);
    const nom = (data.last_name || 'employe').replace(/\s+/g, '-');
    const filename = `fiche-employe-${nom}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('[EMPLOYE_FICHE_PDF]', err);
    return res.status(500).json({ message: 'Erreur lors de la génération de la fiche' });
  }
});

/**
 * POST /api/v1/employe/:id/card/send-email
 * Envoie la carte d'assuré (PDF) par email. Body optionnel : { "email": "..." }. Sinon envoi à l'email de l'employé.
 */
let sendMailCarteAssure;
try {
  const u2 = require('../../utility2');
  sendMailCarteAssure = u2.sendMailCarteAssure || null;
} catch {
  sendMailCarteAssure = null;
}
router.post('/:id/card/send-email', EmployeurToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { error, message, employe } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
    if (error) return res.status(error).json({ message });
    const full = await Employe.findByPk(employe.id, {
      attributes: ['id', 'first_name', 'last_name', 'no_immatriculation', 'avatar', 'immatriculation_date', 'worked_date', 'createdAt', 'email'],
      include: [{ association: 'employeur', attributes: ['raison_sociale'] }]
    });
    if (!full) return res.status(404).json({ message: 'Employé non trouvé' });
    const toEmail = (req.body && req.body.email) ? req.body.email.trim() : (full.email || '').trim();
    if (!toEmail) return res.status(400).json({ message: 'Aucune adresse email (fournissez "email" dans le body ou l\'employé doit avoir un email)' });
    const data = full.toJSON ? full.toJSON() : full;
    const pdfBuffer = await generateCarteAssurePdfBuffer(data);
    if (sendMailCarteAssure) {
      await sendMailCarteAssure(toEmail, `${data.first_name || ''} ${data.last_name || ''}`.trim(), pdfBuffer);
    } else {
      return res.status(503).json({ message: 'Envoi d\'email non configuré (utility2.sendMailCarteAssure)' });
    }
    return res.status(200).json({ message: 'Carte envoyée avec succès', sent_to: toEmail });
  } catch (err) {
    console.error('[EMPLOYE_CARD_SEND_EMAIL]', err);
    return res.status(500).json({ message: 'Erreur lors de l\'envoi de la carte' });
  }
});

/**
 * GET /api/v1/employe/:id/card
 * Métadonnées de la carte (statut, date émission, employeur actuel) pour affichage "Carte à jour".
 */
router.get('/:id/card', EmployeurToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { error, message, employe } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
    if (error) return res.status(error).json({ message });
    const full = await Employe.findByPk(employe.id, {
      attributes: ['id', 'no_immatriculation', 'immatriculation_date', 'worked_date', 'employeurId', 'is_out'],
      include: [{ association: 'employeur', attributes: ['id', 'raison_sociale'] }]
    });
    if (!full) return res.status(404).json({ message: 'Employé non trouvé' });
    const e = full.toJSON ? full.toJSON() : full;
    const dateEmission = e.immatriculation_date || e.worked_date || full.createdAt;
    const dateStr = dateEmission ? new Date(dateEmission).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
    return res.status(200).json({
      statut_carte: e.is_out ? 'inactive' : 'active',
      date_emission: dateStr,
      date_validite_carte: null,
      type_assure: 'Régime Général',
      employeur_actuel: (e.employeur && e.employeur.raison_sociale) ? e.employeur.raison_sociale : null,
      no_immatriculation: e.no_immatriculation
    });
  } catch (err) {
    console.error('[EMPLOYE_CARD]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/employe/:id/prestations
 * Prestations actives, demandes en cours, éligibilité (structure minimale).
 */
router.get('/:id/prestations', EmployeurToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { error, message, employe } = await ensureEmployeBelongsToEmployeur(id, req.user.user_id);
    if (error) return res.status(error).json({ message });
    const demandes = await Demande.findAll({
      where: { employeurId: employe.employeurId },
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    const demandesEnCours = demandes.filter(d => d.status && !d.response).map(d => ({
      id: d.id,
      type: d.motif || 'Demande',
      reference: d.reference || `DEM-${d.id}`,
      date_depot: d.createdAt,
      statut: d.status || 'En cours'
    }));
    return res.status(200).json({
      actives: [],
      demandes_en_cours: demandesEnCours,
      eligibilite: []
    });
  } catch (err) {
    console.error('[EMPLOYE_PRESTATIONS]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
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
// 3b. ROUTES ADMIN (verifyToken + employeurId dans body/query)
// ============================================

/**
 * POST /api/v1/employe/admin/save
 *
 * Crée un nouvel employé depuis le back-office admin avec fichiers (CNI, avatar, contrat).
 * Middleware: verifyToken, employeUpload.fields([cni, avatar, contrat_file])
 * FormData: employe (JSON string), cni (file, requis), avatar (file, requis), contrat_file (file, optionnel)
 */
router.post('/admin/save', verifyToken, employeUpload.fields(employeFileFields), async (req, res) => {
  try {
    const files = req.files || {};

    if (!files['cni'] || !files['cni'][0]) {
      return res.status(400).json({ success: false, message: 'Fichier CNI requis' });
    }
    if (!files['avatar'] || !files['avatar'][0]) {
      return res.status(400).json({ success: false, message: 'Photo de profil requise' });
    }

    let data;
    try {
      data = JSON.parse(req.body.employe);
    } catch (_) {
      return res.status(400).json({ success: false, message: 'Données employé invalides (JSON)' });
    }

    const {
      employeurId, first_name, last_name, gender, date_of_birth, place_of_birth,
      nationality, situation_matrimoniale, phone_number, email, matricule,
      fonction, type_contrat, worked_date, salary, prefecture,
      father_last_name, father_first_name, mother_last_name, mother_first_name,
      type_piece, num_piece, identity_number, ville, quartier, adress
    } = data;

    if (!employeurId) return res.status(400).json({ success: false, message: 'employeurId requis' });
    if (!first_name) return res.status(400).json({ success: false, message: 'Prénom requis' });
    if (!last_name) return res.status(400).json({ success: false, message: 'Nom requis' });
    if (!gender) return res.status(400).json({ success: false, message: 'Genre requis' });
    if (!fonction) return res.status(400).json({ success: false, message: 'Fonction requise' });
    if (!type_contrat) return res.status(400).json({ success: false, message: 'Type de contrat requis' });
    if (!worked_date) return res.status(400).json({ success: false, message: "Date d'embauche requise" });
    if (salary == null || salary === '') return res.status(400).json({ success: false, message: 'Salaire requis' });

    const avatarPath = 'uploads/' + path.basename(files['avatar'][0].path);
    const cniPath = 'uploads/' + path.basename(files['cni'][0].path);
    const contratPath = (files['contrat_file'] && files['contrat_file'][0])
      ? 'uploads/' + path.basename(files['contrat_file'][0].path)
      : null;

    const employe = await Employe.create({
      employeurId: parseInt(employeurId),
      prefectureId: prefecture ? parseInt(prefecture) : null,
      first_name: String(first_name).trim(),
      last_name: String(last_name).trim(),
      gender,
      date_of_birth: date_of_birth || null,
      place_of_birth: place_of_birth || null,
      nationality: nationality || null,
      situation_matrimoniale: situation_matrimoniale || null,
      phone_number: phone_number || null,
      email: email || null,
      matricule: matricule || null,
      fonction: String(fonction).trim(),
      type_contrat,
      worked_date: new Date(worked_date),
      date_first_embauche: new Date(worked_date),
      salary: Number(salary),
      avatar: avatarPath,
      cni_file: cniPath,
      contrat_file: contratPath,
      father_last_name: father_last_name || null,
      father_first_name: father_first_name || null,
      mother_last_name: mother_last_name || null,
      mother_first_name: mother_first_name || null,
      type_piece: type_piece || null,
      num_piece: num_piece || identity_number || null,
      ville: ville || null,
      quartier: quartier || null,
      adress: adress || null,
      no_immatriculation: null,
      is_imma: false,
      is_out: false,
    });

    return res.status(200).json({ success: true, data: employe });
  } catch (error) {
    console.error('[EMPLOYE_ADMIN_SAVE]', error);
    let message = utility.formatSequelizeError ? utility.formatSequelizeError(error) : error.message;
    if (error.fields) {
      const field = Object.keys(error.fields)[0];
      const labels = { phone_number: 'Ce numéro de téléphone', email: 'Cet email' };
      message = `${labels[field] || 'Cette valeur'} existe déjà.`;
    }
    return res.status(400).json({ success: false, message });
  }
});

/**
 * POST /api/v1/employe/admin/import_excel
 *
 * Import d'employés depuis Excel — version admin.
 * Middleware: verifyToken
 * FormData: excel (file), employeurId (string)
 */
router.post('/admin/import_excel', verifyToken, employeUpload.single('excel'), async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ success: false, message: 'Fichier Excel requis' });
    }

    const employeurId = parseInt(req.body.employeurId);
    if (!employeurId || isNaN(employeurId)) {
      return res.status(400).json({ success: false, message: 'employeurId requis' });
    }

    const workbook = XLSX.readFile(req.file.path, { type: 'file', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rows || rows.length < 2) {
      return res.status(400).json({ success: false, message: "Le fichier doit contenir une ligne d'en-têtes et au moins une ligne de données." });
    }

    const headers = rows[0].map(h => normalizeHeader(h));
    const dataRows = rows.slice(1);
    const errors = [];
    const toCreate = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2;
      const record = {};
      for (let c = 0; c < headers.length; c++) {
        const key = EXCEL_COLUMN_MAP[headers[c]];
        if (key && key !== 'prefecture_name') {
          let val = row[c];
          if (typeof val === 'string') val = val.trim();
          record[key] = val;
        } else if (key === 'prefecture_name') {
          let val = row[c];
          if (typeof val === 'string') val = val.trim();
          record.prefectureName = val;
        }
      }

      const first_name = record.first_name ? String(record.first_name).trim() : '';
      const last_name = record.last_name ? String(record.last_name).trim() : '';
      const email = record.email ? String(record.email).trim() : null;
      const phone_number = record.phone_number ? String(record.phone_number).replace(/\s/g, '') : null;

      if (!first_name) errors.push({ row: rowNum, field: 'Prenom', message: 'Prénom requis.' });
      if (!last_name) errors.push({ row: rowNum, field: 'Nom', message: 'Nom requis.' });

      if (email) {
        const exists = await Employe.findOne({ where: { email } });
        if (exists) errors.push({ row: rowNum, field: 'Email', message: 'Email déjà utilisé.' });
      }
      if (phone_number) {
        const exists = await Employe.findOne({ where: { phone_number } });
        if (exists) errors.push({ row: rowNum, field: 'Telephone', message: 'Téléphone déjà utilisé.' });
      }

      const prefectureName = record.prefectureName ? String(record.prefectureName).trim() : '';
      let prefectureId = null;
      if (prefectureName) {
        const pref = await Prefecture.findOne({
          where: sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), sequelize.fn('LOWER', prefectureName))
        });
        if (!pref) errors.push({ row: rowNum, field: 'Prefecture', message: `Préfecture introuvable : "${prefectureName}".` });
        else prefectureId = pref.id;
      }

      if (errors.length === 0 || errors[errors.length - 1].row !== rowNum) {
        toCreate.push({
          employeurId,
          first_name,
          last_name,
          email,
          phone_number,
          gender: record.gender || null,
          date_of_birth: record.date_of_birth || null,
          prefectureId,
          worked_date: record.worked_date || null,
          date_first_embauche: record.worked_date || null,
          salary: record.salary ? Number(record.salary) : null,
          type_contrat: record.type_contrat || null,
          matricule: record.matricule || null,
          fonction: record.fonction || null,
          situation_matrimoniale: record.situation_matrimoniale || null,
          is_imma: false,
          is_out: false,
        });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Import annulé : des erreurs ont été détectées.',
        errors,
        errorsText: errors.map(e => `Ligne ${e.row} – ${e.field} : ${e.message}`).join('\n')
      });
    }

    if (toCreate.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucune ligne valide à importer.' });
    }

    const t = await sequelize.transaction();
    try {
      await Employe.bulkCreate(toCreate, { transaction: t, validate: true });
      await t.commit();
      return res.status(200).json({ success: true, message: `${toCreate.length} employé(s) importé(s).`, count: toCreate.length });
    } catch (bulkErr) {
      await t.rollback();
      return res.status(400).json({ success: false, message: bulkErr.message || "Erreur lors de l'import." });
    }
  } catch (error) {
    console.error('[EMPLOYE_ADMIN_IMPORT]', error);
    return res.status(500).json({ success: false, message: 'Erreur interne' });
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
  }
});

/**
 * POST /api/v1/employe/admin/import_excel_adhesion
 *
 * Import d'employés déjà immatriculés (adhesion) — version admin.
 * Middleware: verifyToken
 * FormData: excel (file), employeurId (string)
 */
router.post('/admin/import_excel_adhesion', verifyToken, employeUpload.single('excel'), async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ success: false, message: 'Fichier Excel requis' });
    }

    const employeurId = parseInt(req.body.employeurId);
    if (!employeurId || isNaN(employeurId)) {
      return res.status(400).json({ success: false, message: 'employeurId requis' });
    }

    const workbook = XLSX.readFile(req.file.path, { type: 'file', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rows || rows.length < 2) {
      return res.status(400).json({ success: false, message: "Le fichier doit contenir une ligne d'en-têtes et au moins une ligne de données." });
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

      if (!no_immatriculation) errors.push({ row: rowNum, field: 'N° Immatriculation', message: "N° d'immatriculation requis." });
      if (!first_name) errors.push({ row: rowNum, field: 'Prenom', message: 'Prénom requis.' });
      if (!last_name) errors.push({ row: rowNum, field: 'Nom', message: 'Nom requis.' });

      if (no_immatriculation) {
        const existingNo = await Employe.findOne({ where: { no_immatriculation } });
        if (existingNo) errors.push({ row: rowNum, field: 'N° Immatriculation', message: "Un employé avec ce numéro d'immatriculation existe déjà." });
      }
      if (email) {
        const existingEmail = await Employe.findOne({ where: { email } });
        if (existingEmail) errors.push({ row: rowNum, field: 'Email', message: 'Un employé avec cet email existe déjà.' });
      }
      if (phone_number) {
        const existingPhone = await Employe.findOne({ where: { phone_number } });
        if (existingPhone) errors.push({ row: rowNum, field: 'Telephone', message: 'Un employé avec ce numéro de téléphone existe déjà.' });
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
      return res.status(400).json({ success: false, message: 'Import annulé : des erreurs ont été détectées. Corrigez le fichier et réessayez.', errors, errorsText });
    }

    if (toCreate.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucune ligne de donnée valide à importer.' });
    }

    if (toCreate.length > 1000) {
      return res.status(400).json({ success: false, message: 'Maximum 1000 employés par import.' });
    }

    const t = await sequelize.transaction();
    try {
      await Employe.bulkCreate(toCreate, { transaction: t, validate: true });
      await t.commit();
      return res.status(200).json({ success: true, message: `${toCreate.length} employé(s) déjà immatriculés importé(s) avec succès.`, count: toCreate.length });
    } catch (bulkError) {
      await t.rollback();
      return res.status(400).json({ success: false, message: bulkError.message || "Erreur lors de l'import." });
    }
  } catch (error) {
    console.error('[EMPLOYE_ADMIN_IMPORT_ADHESION]', error);
    return res.status(500).json({ success: false, message: 'Erreur interne du serveur' });
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
  }
});

/**
 * POST /api/v1/employe/admin/verify
 *
 * Vérifie si un employé existe par N° immatriculation (nouvelle DB ou ancienne).
 * Middleware: verifyToken
 * Body: { code, employeurId }
 */
router.post('/admin/verify', verifyToken, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: "N° d'immatriculation requis" });

    const trimmed = code.trim();

    // Recherche nouvelle DB
    const employe = await Employe.findOne({
      where: { no_immatriculation: trimmed },
      include: [{ association: 'prefecture' }]
    });

    if (employe) {
      if (!employe.is_out) {
        return res.status(400).json({ success: false, message: "Cet employé est déjà rattaché à un employeur." });
      }
      const p = employe.toJSON();
      return res.status(200).json({
        success: true,
        data: {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          gender: p.gender,
          date_of_birth: p.date_of_birth,
          place_of_birth: p.place_of_birth,
          no_immatriculation: p.no_immatriculation,
          from_external: false,
        }
      });
    }

    // Ancienne DB
    const correctedCode = utility.corrigerNumero(trimmed);
    try {
      const ext = await axios.get(`${util_link}/c/${correctedCode}`);
      if (ext.status === 200 && ext.data?.result) {
        const d = ext.data.result;
        return res.status(200).json({
          success: true,
          data: {
            id: null,
            first_name: d.prenoms || '',
            last_name: d.nom || '',
            gender: d.sexe || null,
            date_of_birth: d.date_naissance || null,
            place_of_birth: d.lieu_naissance || null,
            no_immatriculation: d.no_employe || correctedCode,
            from_external: true,
          }
        });
      }
    } catch (_) {}

    return res.status(404).json({ success: false, message: 'Employé introuvable dans la base CNSS.' });
  } catch (error) {
    console.error('[EMPLOYE_ADMIN_VERIFY]', error);
    return res.status(500).json({ success: false, message: 'Erreur interne' });
  }
});

/**
 * POST /api/v1/employe/admin/recruit
 *
 * Recrute un employé déjà immatriculé — version admin.
 * Middleware: verifyToken
 * Body: { code, employeurId, worked_date, salary, fonction, type_contrat, phone_number?, email? }
 */
router.post('/admin/recruit', verifyToken, async (req, res) => {
  try {
    const { code, employeurId, worked_date, salary, fonction, type_contrat, phone_number, email } = req.body;
    if (!code) return res.status(400).json({ success: false, message: "Code d'immatriculation requis" });
    if (!employeurId) return res.status(400).json({ success: false, message: 'employeurId requis' });
    if (!worked_date) return res.status(400).json({ success: false, message: "Date d'embauche requise" });
    if (!salary && salary !== 0) return res.status(400).json({ success: false, message: 'Salaire requis' });
    if (!fonction) return res.status(400).json({ success: false, message: 'Fonction requise' });

    const empId = parseInt(employeurId);
    const trimmed = code.trim();
    const salaryNum = Number(salary);

    let employe = await Employe.findOne({ where: { no_immatriculation: trimmed, is_out: true } });

    if (employe) {
      const upd = { employeurId: empId, is_out: false, worked_date: new Date(worked_date), salary: salaryNum, fonction: String(fonction).trim() };
      if (type_contrat) upd.type_contrat = type_contrat;
      if (phone_number) upd.phone_number = phone_number;
      if (email) upd.email = email;
      await employe.update(upd);
      await Carer.create({ employeId: employe.id, employeurId: empId, date_entre: new Date(worked_date) });
      return res.status(200).json({ success: true, data: employe });
    }

    // Depuis ancienne DB
    const correctedCode = utility.corrigerNumero(trimmed);
    let extData;
    try {
      const ext = await axios.get(`${util_link}/c/${correctedCode}`);
      if (ext.data?.result) extData = ext.data.result;
    } catch (_) {}

    if (!extData) return res.status(400).json({ success: false, message: 'Employé introuvable.' });

    employe = await Employe.create({
      employeurId: empId,
      first_name: extData.prenoms || '',
      last_name: extData.nom || '',
      no_immatriculation: extData.no_employe || correctedCode,
      date_of_birth: extData.date_naissance || null,
      gender: extData.sexe || null,
      place_of_birth: extData.lieu_naissance || null,
      nationality: extData.nationalite || null,
      mother_last_name: extData.nom_mere || null,
      father_last_name: extData.nom_pere || null,
      father_first_name: extData.prenom_pere || null,
      mother_first_name: extData.prenom_mere || null,
      type_contrat: type_contrat || 'CDI',
      is_imma: true,
      is_out: false,
      worked_date: new Date(worked_date),
      date_first_embauche: new Date(worked_date),
      salary: salaryNum,
      fonction: String(fonction).trim(),
      phone_number: phone_number || null,
      email: email || null,
    });
    await Carer.create({ employeId: employe.id, employeurId: empId, date_entre: new Date(worked_date) });

    return res.status(200).json({ success: true, data: employe });
  } catch (error) {
    console.error('[EMPLOYE_ADMIN_RECRUIT]', error);
    return res.status(400).json({ success: false, message: error.message || 'Erreur' });
  }
});

// ============================================
// 4. VÉRIFICATION ET RÉCUPÉRATION D'EMPLOYÉS
// ============================================

/**
 * POST /api/v1/employe/verify_employe
 *
 * Vérifie si un employé existe et est recrutable. Ne crée rien en base.
 * - Trouvé en nouvelle DB (is_out: true) → retourne l'employé.
 * - Trouvé uniquement en ancienne DB (externe) → retourne les infos en lecture seule (from_external: true).
 * L'employé n'est créé qu'au recrutement (recruit_employe) après remplissage du formulaire.
 * Middleware: EmployeurToken
 */
router.post('/verify_employe', EmployeurToken, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Code d\'immatriculation requis' });
    }

    const trimmedCode = code.trim();

    // 1. Recherche dans la nouvelle DB
    const employe = await Employe.findOne({
      where: { no_immatriculation: trimmedCode },
      include: [{ association: 'prefecture' }]
    });

    if (employe) {
      if (employe.is_out === true) {
        return res.status(200).json(employe);
      }
      return res.status(400).json({ message: "Cet employé n'est pas encore libre" });
    }

    // 2. Non trouvé en base locale : interroger le serveur externe (lecture seule, pas de create)
    const correctedCode = utility.corrigerNumero(trimmedCode);
    try {
      const getResponse = await axios.get(`${util_link}/c/${correctedCode}`);

      if (getResponse.status === 200 && getResponse.data && getResponse.data.result) {
        const oldData = getResponse.data.result;
        const payload = {
          id: null,
          first_name: oldData.prenoms || '',
          last_name: oldData.nom || '',
          no_immatriculation: oldData.no_employe || correctedCode,
          date_of_birth: oldData.date_naissance || null,
          gender: oldData.sexe || null,
          place_of_birth: oldData.lieu_naissance || null,
          nationality: oldData.nationalite || null,
          mother_last_name: oldData.nom_mere || null,
          father_last_name: oldData.nom_pere || null,
          father_first_name: oldData.prenom_pere || null,
          mother_first_name: oldData.prenom_mere || null,
          worked_date: oldData.date_embauche || null,
          phone_number: null,
          email: null,
          fonction: null,
          salary: null,
          type_contrat: null,
          is_imma: true,
          is_out: true,
          employeurId: null,
          from_external: true
        };
        return res.status(200).json(payload);
      }
      return res.status(400).json({ message: 'Employé non trouvé' });
    } catch (oldDbError) {
      console.error('[EMPLOYE_VERIFY] Old DB error:', oldDbError);
      return res.status(400).json({ message: 'Employé non trouvé' });
    }
  } catch (error) {
    console.error('[EMPLOYE_VERIFY] Error:', error);
    return res.status(400).json({ message: 'Erreur' });
  }
});

/**
 * POST /api/v1/employe/recruit_employe
 *
 * Rattache un employé déjà immatriculé (libre, is_out: true) à l'employeur connecté.
 * Le formulaire (étape 2 du stepper) doit être rempli : l'employé n'est ajouté qu'après envoi des champs requis.
 * Body: { code: string, worked_date: string, salary: number, fonction: string, phone_number?, email?, type_contrat? }
 * Champs obligatoires: code, worked_date, salary, fonction.
 * 200 → employé mis à jour + carrière créée. 400 → champs manquants ou employé non trouvé / pas libre.
 */
router.post('/recruit_employe', EmployeurToken, async (req, res) => {
  try {
    const { code, worked_date, salary, fonction, phone_number, email, type_contrat } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ message: 'Code d\'immatriculation requis' });
    }
    if (!worked_date || (typeof worked_date === 'string' && !worked_date.trim())) {
      return res.status(400).json({ message: 'La date d\'embauche est obligatoire' });
    }
    if (salary == null || salary === '' || (typeof salary === 'number' && Number.isNaN(salary))) {
      return res.status(400).json({ message: 'Le salaire brut est obligatoire' });
    }
    const salaryNum = Number(salary);
    if (Number.isNaN(salaryNum) || salaryNum < 0) {
      return res.status(400).json({ message: 'Le salaire doit être un nombre positif' });
    }
    if (!fonction || (typeof fonction === 'string' && !fonction.trim())) {
      return res.status(400).json({ message: 'La fonction est obligatoire' });
    }

    const employeurId = req.user.user_id;
    const trimmedCode = code.trim();

    let employe = await Employe.findOne({
      where: { no_immatriculation: trimmedCode, is_out: true },
      include: [{ association: 'prefecture' }]
    });

    if (employe) {
      const updatePayload = {
        employeurId,
        is_out: false,
        worked_date: new Date(worked_date),
        salary: salaryNum,
        fonction: String(fonction).trim()
      };
      if (type_contrat != null && type_contrat !== '') updatePayload.type_contrat = String(type_contrat).trim();
      if (phone_number != null) updatePayload.phone_number = phone_number === '' ? null : String(phone_number).trim();
      if (email != null) updatePayload.email = email === '' ? null : String(email).trim();
      await employe.update(updatePayload);
      const dateEntree = employe.worked_date ? new Date(employe.worked_date) : new Date();
      await Carer.create({
        employeId: employe.id,
        employeurId,
        date_entre: dateEntree
      });
      await employe.reload({ include: [{ association: 'prefecture' }] });
      return res.status(200).json(employe);
    }

    // Employé pas en nouvelle DB : venant de l'externe, on crée uniquement au recrutement (formulaire rempli)
    const correctedCode = utility.corrigerNumero(trimmedCode);
    let getResponse;
    try {
      getResponse = await axios.get(`${util_link}/c/${correctedCode}`);
    } catch (extErr) {
      console.error('[EMPLOYE_RECRUIT] External API error:', extErr);
      return res.status(400).json({
        message: 'Employé non trouvé. Vérifiez le numéro ou effectuez une vérification d\'abord.'
      });
    }
    if (!getResponse?.data?.result) {
      return res.status(400).json({ message: 'Employé non trouvé' });
    }
    const oldData = getResponse.data.result;
    const dateEntree = new Date(worked_date);
    employe = await Employe.create({
      employeurId,
      first_name: oldData.prenoms || '',
      last_name: oldData.nom || '',
      no_immatriculation: oldData.no_employe || correctedCode,
      date_of_birth: oldData.date_naissance || null,
      gender: oldData.sexe || null,
      place_of_birth: oldData.lieu_naissance || null,
      nationality: oldData.nationalite || null,
      mother_last_name: oldData.nom_mere || null,
      father_last_name: oldData.nom_pere || null,
      father_first_name: oldData.prenom_pere || null,
      mother_first_name: oldData.prenom_mere || null,
      type_contrat: (type_contrat && String(type_contrat).trim()) || 'Permanent',
      is_imma: true,
      is_out: false,
      worked_date: dateEntree,
      salary: salaryNum,
      fonction: String(fonction).trim(),
      phone_number: phone_number === '' || phone_number == null ? null : String(phone_number).trim(),
      email: email === '' || email == null ? null : String(email).trim(),
      is_adhesion: true,
      is_insert_oldDB: true
    });
    await Carer.create({
      employeId: employe.id,
      employeurId,
      date_entre: dateEntree
    });
    await employe.reload({ include: [{ association: 'prefecture' }] });
    return res.status(200).json(employe);
  } catch (error) {
    console.error('[EMPLOYE_RECRUIT] Error:', error);
    return res.status(500).json({ message: 'Erreur lors du recrutement' });
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

    Employe.contrat_file = 'uploads/' + path.basename(files['contrat_file'][0].path);
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

    Employe.cni_file = 'uploads/' + path.basename(req.file.path);
    await Employe.save();

    return res.status(200).json({ message: "ok ok" });
  } catch (error) {
    console.error('[EMPLOYE_UPDATE_CNI] Error:', error);
    return res.status(500).json({ message: 'Erreur Interne' });
  }
});

/**
 * POST /api/v1/employe/update_employe_avatar/:employeId
 * Met à jour uniquement la photo de profil (legacy). Préférer PATCH /api/v1/employe/:id/avatar.
 */
router.post('/update_employe_avatar/:employeId', EmployeurToken, employeUpload.fields([{ name: 'avatar', maxCount: 1 }]), async (req, res) => {
  try {
    const employeId = parseInt(req.params.employeId);
    const files = req.files;
    if (isNaN(employeId)) return res.status(400).json({ message: 'ID invalide' });
    if (!files || !files['avatar'] || !files['avatar'][0]) return res.status(400).json({ message: 'Photo de profil requise' });

    const employe = await Employe.findByPk(employeId);
    if (!employe) return res.status(404).json({ message: 'Employé non trouvé' });
    if (employe.employeurId !== req.user.user_id) return res.status(403).json({ message: 'Accès refusé' });

    const relativePath = 'uploads/' + path.basename(files['avatar'][0].path);
    await employe.update({ avatar: relativePath });
    const avatar_url = '/' + relativePath.replace(/^\/+/, '');
    return res.status(200).json({ message: 'ok', avatar: relativePath, avatar_url });
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
      await employe.destroy();
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
