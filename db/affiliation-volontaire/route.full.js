/**
 * Routes affiliation volontaire – version améliorée
 * Simulation, demande d'affiliation, listes paginées, validation, get_connected.
 *
 * Dépendances optionnelles à la racine :
 * - ../../utility : upload, util_link
 * - ../../config.queue : addJob
 */
const express = require('express');
const { EmployeurToken } = require('../users/utility');
const { verifyToken } = require('../XYemployeurs/utility');
const AffiliationVolontaire = require('./model');
const Branche = require('../branches/model');
const Prefecture = require('../prefecture/model');
const utility = require('./utility');

const { computeSimulation, mapRequestToModel } = utility;

// Pagination
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function getPaginationParams(source = {}) {
  const page = Math.max(1, parseInt(source.page, 10) || DEFAULT_PAGE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(source.pageSize, 10) || DEFAULT_PAGE_SIZE));
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

function formatPaginatedResponse(data, totalItems, page, pageSize) {
  return {
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
    currentPage: page,
    pageSize,
    data
  };
}

// Modules optionnels
let upload, addJob;
try {
  const rootUtil = require('../../utility');
  upload = rootUtil.upload || null;
} catch {
  upload = null;
}

// Fallback multer si ../../utility non disponible (limite 10 MB par fichier)
if (!upload) {
  const multer = require('multer');
  const path = require('path');
  const fs = require('fs');
  const uploadDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `av-${file.fieldname}-${unique}${path.extname(file.originalname)}`);
    }
  });
  upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024, files: 3 } });
  console.log('[AV] Multer fallback initialisé (limite 10 MB/fichier, max 3 fichiers)');
}
try {
  addJob = require('../../config.queue').addJob;
} catch {
  addJob = async () => {};
}

const router = express.Router();

const fileFields = [
  { name: 'cni', maxCount: 1 },
  { name: 'requester_picture', maxCount: 1 },
  { name: 'certificat_residence', maxCount: 1 }
];

// ---------- Simulation ----------
router.post('/simulation', async (req, res) => {
  try {
    const data = req.body;
    if (!data || data.revenu_annuel == null) {
      return res.status(400).json({ message: 'revenu_annuel requis' });
    }
    const result = computeSimulation(data);
    return res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ---------- Demande d'affiliation volontaire ----------
const uploadMiddleware = upload && upload.fields ? upload.fields(fileFields) : (req, res, next) => next();

router.post('/request_affiliation_volontaire', uploadMiddleware, async (req, res) => {
  console.log('[AV_REQUEST] ── Nouvelle demande reçue ──');
  console.log('[AV_REQUEST] Content-Type:', req.headers['content-type']);
  console.log('[AV_REQUEST] Body keys:', Object.keys(req.body || {}));
  console.log('[AV_REQUEST] Files:', Object.keys(req.files || {}));

  try {
    // 1. Extraire et parser la payload
    let data_request;
    const rawField = req.body?.request_affiliation_volontaire;

    if (!rawField && Object.keys(req.body || {}).length > 0) {
      // Corps JSON direct (sans l'enveloppe request_affiliation_volontaire)
      console.log('[AV_REQUEST] Pas de clé request_affiliation_volontaire — tentative lecture body direct');
      data_request = req.body;
    } else if (!rawField) {
      console.error('[AV_REQUEST] Body vide ou champ request_affiliation_volontaire absent');
      return res.status(400).json({
        success: false,
        message: 'Le champ request_affiliation_volontaire est requis dans le body (multipart ou JSON)'
      });
    } else if (typeof rawField === 'string') {
      try {
        data_request = JSON.parse(rawField);
        console.log('[AV_REQUEST] JSON parsé depuis string. Clés:', Object.keys(data_request));
      } catch (parseErr) {
        console.error('[AV_REQUEST] Échec du JSON.parse:', parseErr.message);
        console.error('[AV_REQUEST] Valeur reçue:', rawField.substring(0, 200));
        return res.status(400).json({
          success: false,
          message: 'Le champ request_affiliation_volontaire contient un JSON invalide : ' + parseErr.message
        });
      }
    } else {
      data_request = rawField;
      console.log('[AV_REQUEST] Objet direct. Clés:', Object.keys(data_request));
    }

    // 2. Vérifications champs obligatoires
    const missing = [];
    const nomVal    = data_request.last_name   || data_request.nom;
    const prenomVal = data_request.first_name  || data_request.prenom;
    const emailVal  = data_request.email;
    const phoneVal  = data_request.phone_number;

    if (!nomVal)    missing.push('nom (ou last_name)');
    if (!prenomVal) missing.push('prénom (ou first_name)');
    if (!emailVal)  missing.push('email');
    if (!phoneVal)  missing.push('phone_number');

    if (missing.length > 0) {
      console.warn('[AV_REQUEST] Champs manquants:', missing.join(', '));
      return res.status(400).json({
        success: false,
        message: `Champs obligatoires manquants : ${missing.join(', ')}`
      });
    }

    // 3. Vérifier doublon email
    const existingEmail = await AffiliationVolontaire.findOne({ where: { email: emailVal } });
    if (existingEmail) {
      console.warn('[AV_REQUEST] Email déjà utilisé:', emailVal, '→ id', existingEmail.id);
      return res.status(400).json({
        success: false,
        message: `L'adresse email ${emailVal} est déjà associée à une demande d'affiliation (réf. #${existingEmail.id})`
      });
    }

    // 4. Vérifier doublon téléphone
    const existingPhone = await AffiliationVolontaire.findOne({ where: { phone_number: phoneVal } });
    if (existingPhone) {
      console.warn('[AV_REQUEST] Téléphone déjà utilisé:', phoneVal, '→ id', existingPhone.id);
      return res.status(400).json({
        success: false,
        message: `Le numéro ${phoneVal} est déjà associé à une demande d'affiliation (réf. #${existingPhone.id})`
      });
    }

    // 5. Attacher les fichiers uploadés
    const files = req.files || {};
    if (files.cni?.[0]) {
      data_request.cni_file_path = files.cni[0].path;
      console.log('[AV_REQUEST] Fichier CNI:', files.cni[0].filename);
    }
    if (files.requester_picture?.[0]) {
      data_request.requester_picture = files.requester_picture[0].path;
      console.log('[AV_REQUEST] Photo:', files.requester_picture[0].filename);
    }
    if (files.certificat_residence?.[0]) {
      data_request.certificat_residence_file = files.certificat_residence[0].path;
      console.log('[AV_REQUEST] Certificat résidence:', files.certificat_residence[0].filename);
    }

    // 6. Mapper et créer
    const payload = mapRequestToModel(data_request);
    console.log('[AV_REQUEST] Payload → DB:', JSON.stringify({
      nom: payload.nom, prenom: payload.prenom,
      email: payload.email, phone_number: payload.phone_number,
      profession: payload.profession, sexe: payload.sexe
    }));

    const created = await AffiliationVolontaire.create(payload);
    console.log('[AV_REQUEST] ✅ Créé avec succès. ID:', created.id);

    return res.status(200).json({
      success: true,
      message: "Demande d'affiliation volontaire soumise avec succès",
      id: created.id
    });

  } catch (error) {
    // 413 — Fichier trop volumineux (Multer)
    if (error.code === 'LIMIT_FILE_SIZE') {
      console.error('[AV_REQUEST] ❌ 413 Fichier trop volumineux:', error.field, error.message);
      return res.status(413).json({
        success: false,
        message: `Fichier trop volumineux (champ: ${error.field || 'inconnu'}). Taille maximale autorisée dépassée.`
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      console.error('[AV_REQUEST] ❌ 413 Trop de fichiers:', error.message);
      return res.status(413).json({
        success: false,
        message: 'Trop de fichiers envoyés.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      console.error('[AV_REQUEST] ❌ 400 Champ fichier inattendu:', error.field);
      return res.status(400).json({
        success: false,
        message: `Champ fichier non autorisé : "${error.field}". Champs acceptés : cni, requester_picture, certificat_residence`
      });
    }

    // Erreur Sequelize : extraire les messages de validation
    if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
      const details = (error.errors || []).map((e) => `${e.path}: ${e.message}`).join(', ');
      console.error('[AV_REQUEST] ❌ Erreur Sequelize:', error.name, '→', details);
      return res.status(400).json({
        success: false,
        message: `Erreur de validation : ${details || error.message}`
      });
    }

    console.error('[AV_REQUEST] ❌ Erreur inattendue:', error.name, error.message);
    console.error(error.stack);
    return res.status(500).json({
      success: false,
      message: `Erreur serveur : ${error.message}`
    });
  }
});

// ---------- Liste paginée (admin / DIRGA) ----------
router.get('/all_affiliation_volontaire', verifyToken, async (req, res) => {
  try {
    const { page, pageSize, offset, limit } = getPaginationParams(req.query);
    const { count, rows } = await AffiliationVolontaire.findAndCountAll({
      include: [
        { model: Branche, as: 'branche' },
        { model: Prefecture, as: 'prefecture' }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });
    return res.status(200).json(formatPaginatedResponse(rows, count, page, pageSize));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ---------- Validation et mise en traitement ----------
router.post('/affiliation_volontaire/:id', verifyToken, async (req, res) => {
  try {
    const av = await AffiliationVolontaire.findByPk(req.params.id);
    if (!av) return res.status(404).json({ message: 'Affiliation volontaire introuvable' });

    av.status = 'En cours de traitement';
    av.is_validated = true;
    av.validated_by = req.user.id;
    av.validated_date = new Date();
    await av.save();

    await addJob({ type: 'affiliation_volontaire', affiliation_volontaireId: req.params.id });
    return res.status(200).json(av);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ---------- Affiliation du connecté (employeur / identité) ----------
router.get('/get_connected', EmployeurToken, async (req, res) => {
  try {
    const identity = req.user?.identity;
    if (!identity) return res.status(400).json({ message: 'Identité utilisateur manquante' });

    const aV = await AffiliationVolontaire.findOne({ where: { no_immatriculation: identity } });
    return res.status(200).json(aV);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

const affiliation_volontaire_router = router;
module.exports = {
  affiliation_volontaire_router
};
