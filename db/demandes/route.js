const express = require('express');
const router = express.Router();
const Demande = require('./model');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');
const CotisationEmployeur = require('../cotisation_employeur/model');
const Quitus = require('../quitus/model');
const Document = require('../document/model');
const utility = require('./utility');
const { EmployeurToken } = require('../users/utility');
const { verifyToken } = require('../XYemployeurs/utility');
const { Op } = require('sequelize');

let genererRecuQuitus, getQuittusFile, SendDemandeMail;
try {
  const u2 = require('../../utility2');
  genererRecuQuitus = u2.genererRecuQuitus || (() => Promise.resolve());
  getQuittusFile = u2.getQuittusFile || (() => Promise.resolve());
  SendDemandeMail = u2.SendDemandeMail || (() => Promise.resolve());
} catch (err) {
  genererRecuQuitus = () => Promise.resolve();
  getQuittusFile = () => Promise.resolve();
  SendDemandeMail = () => Promise.resolve();
}

const sequelize = require('../db.connection');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Module `db/demandes/route.js` – Gestion des demandes de quitus
 * 
 * Ce module gère le cycle de vie complet des demandes de quitus.
 * Base path: /api/v1/demande
 */

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

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
    files: 10
  }
});

// File fields for demande creation
const demandeFileFields = [
  { name: 'RCCM', maxCount: 1 },
  { name: 'NIF', maxCount: 1 },
  { name: 'DSN', maxCount: 1 },
  { name: 'letter', maxCount: 1 }
];

const demandeFileFields2 = [
  { name: 'DSN', maxCount: 1 },
  { name: 'letter', maxCount: 1 }
];

const rapportFileField = [
  { name: 'rapport_file', maxCount: 1 }
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
// 1. CRÉATION DE DEMANDES (EMPLOYEUR)
// ============================================

/**
 * POST /api/v1/demande/create_demande
 * 
 * Crée une nouvelle demande de quitus avec tous les documents requis.
 * Middleware: EmployeurToken, upload.fields([...])
 */
router.post('/create_demande', EmployeurToken, upload.fields(demandeFileFields), async (req, res) => {
  try {
    const files = req.files;

    // Validation des fichiers obligatoires
    if (!files['RCCM'] || !files['RCCM'][0]) {
      return res.status(400).json({ message: 'Fichier RCCM requis' });
    }
    if (!files['NIF'] || !files['NIF'][0]) {
      return res.status(400).json({ message: 'Fichier NIF requis' });
    }
    if (!files['DSN'] || !files['DSN'][0]) {
      return res.status(400).json({ message: 'Fichier DSN requis' });
    }

    // Récupération de la dernière cotisation payée
    const lastCotisation = await CotisationEmployeur.findOne({
      where: {
        employeurId: req.user.user_id,
        is_paid: true
      },
      order: [['paid_date', 'DESC']],
      attributes: ['paid_date', 'quittance']
    });

    // Gestion du fichier lettre (optionnel)
    const letterFilePath = files['letter'] && files['letter'][0] ? files['letter'][0].path : null;

    // Création de la demande
    const demande = await Demande.create({
      motif: "DEMANDE DE QUITUS",
      employeurId: req.user.user_id,
      userId: req.user.id,
      rccm_file: files['RCCM'][0].path,
      nif_file: files['NIF'][0].path,
      dsn_file: files['DSN'][0].path,
      letter_file: letterFilePath,
      last_quittance: lastCotisation?.quittance || null
    });

    // Reload with relations
    await demande.reload({
      include: [
        { association: 'employeur' },
        { association: 'user' }
      ]
    });

    return res.status(200).json(demande);
  } catch (error) {
    console.error('[DEMANDE_CREATE] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/v1/demande/create_demande_2
 * 
 * Crée une demande de quitus en réutilisant les fichiers RCCM et NIF de la dernière demande.
 * Middleware: EmployeurToken, upload.fields([...])
 */
router.post('/create_demande_2', EmployeurToken, upload.fields(demandeFileFields2), async (req, res) => {
  try {
    const files = req.files;

    // Validation du fichier DSN obligatoire
    if (!files['DSN'] || !files['DSN'][0]) {
      return res.status(400).json({ message: 'Fichier DSN requis' });
    }

    // Récupération de la dernière cotisation payée
    const lastCotisation = await CotisationEmployeur.findOne({
      where: {
        employeurId: req.user.user_id,
        is_paid: true
      },
      order: [['paid_date', 'DESC']],
      attributes: ['paid_date', 'quittance']
    });

    // Récupération de la dernière demande
    const last_demande = await Demande.findOne({
      where: { employeurId: req.user.user_id },
      order: [['createdAt', 'DESC']],
      attributes: ['rccm_file', 'nif_file']
    });

    // Gestion du fichier lettre (optionnel)
    const letterFilePath = files['letter'] && files['letter'][0] ? files['letter'][0].path : null;

    // Création de la demande
    const demande = await Demande.create({
      motif: "DEMANDE DE QUITUS",
      employeurId: req.user.user_id,
      userId: req.user.id,
      rccm_file: last_demande?.rccm_file || null,
      nif_file: last_demande?.nif_file || null,
      dsn_file: files['DSN'][0].path,
      letter_file: letterFilePath,
      last_quittance: lastCotisation?.quittance || null
    });

    // Reload with relations
    await demande.reload({
      include: [
        { association: 'employeur' },
        { association: 'user' }
      ]
    });

    return res.status(200).json(demande);
  } catch (error) {
    console.error('[DEMANDE_CREATE_2] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * GET /api/v1/demande/get_employeur_his_demande
 * 
 * Récupère toutes les demandes de l'employeur connecté avec simulation de la date d'expiration.
 * Middleware: EmployeurToken
 */
router.get('/get_employeur_his_demande', EmployeurToken, async (req, res) => {
  try {
    // Récupération des demandes
    const Demandes = await Demande.findAll({
      where: { employeurId: req.user.user_id },
      order: [['createdAt', 'DESC']],
      include: [
        { association: 'employeur' },
        { association: 'user' }
      ]
    });

    // Récupération de la dernière cotisation payée
    const lastCotisation = await CotisationEmployeur.findOne({
      where: {
        employeurId: req.user.user_id,
        is_paid: true
      },
      order: [['paid_date', 'DESC']],
      attributes: ['paid_date']
    });

    if (!lastCotisation) {
      return res.status(400).json({ message: 'not' });
    }

    // Détermination de la catégorie
    const Employes = await Employe.count({ where: { employeurId: req.user.user_id } });
    let categorie = "E-20";
    let numberOfMonth = 3;
    if (Employes > 20) {
      categorie = "E+20";
      numberOfMonth = 1;
    }

    // Calcul de la date d'expiration
    const paidDateStr = new Date(lastCotisation.paid_date).toLocaleDateString('fr');
    const expireQutusLimite = utility.ajouterMoisSelonCategorie(paidDateStr, categorie);

    // Simulation
    const simulation = {
      lastPaid: lastCotisation.paid_date,
      expireQutusLimite: expireQutusLimite
    };

    return res.status(200).json({
      demande: Demandes,
      simulation: simulation
    });
  } catch (error) {
    console.error('[DEMANDE_GET_EMPLOYEUR_HIS] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

// ============================================
// 2. TRAITEMENT DES DEMANDES (DIRGA/DG)
// ============================================

/**
 * POST /api/v1/demande/valide_demande/:id
 * 
 * Valide une demande et génère le quitus PDF avec récépissé.
 * Middleware: verifyToken (DIRGA/DG)
 * CORRIGÉ: Utilise des transactions pour garantir la cohérence
 */
router.post('/valide_demande/:id', verifyToken, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const demandeId = parseInt(req.params.id);
    if (isNaN(demandeId)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'ID invalide' });
    }

    // Récupération de la demande
    const demande = await Demande.findByPk(demandeId, {
      include: [
        { association: 'employeur' },
        { association: 'user' }
      ],
      transaction
    });

    if (!demande) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Demande non trouvée' });
    }

    // Vérification si déjà traitée
    if (demande.DG_traite && demande.response) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Demande déjà traitée' });
    }

    // Génération de la référence unique
    const ref = await utility.generateUniqueReference();

    // Détermination de la catégorie
    const employes = await Employe.findAll({ 
      where: { employeurId: demande.employeur.id },
      transaction
    });
    let categorie = "E-20";
    let numberOfMonth = "";
    if (employes.length > 20) {
      categorie = "E+20";
      numberOfMonth = "1 mois";
    }

    // Génération du récépissé
    const recipiserFileName = `Demande-${demande.id}-recepisse-${demande.employeur.no_immatriculation}`;
    await genererRecuQuitus(demande.employeur, ref, recipiserFileName);

    // Enregistrement du récépissé
    await Document.create({
      name: `récépissé N° ${demande.id}`,
      path: `/api/v1/docsx/${recipiserFileName}.pdf`,
      employeurId: demande.employeur.id
    }, { transaction });

    // Mise à jour de la demande
    demande.doc_path = `/api/v1/docsx/${recipiserFileName}.pdf`;
    demande.dirga_traite = true;
    demande.status = 'Traitée';
    demande.response_date = new Date().toISOString();
    demande.DG_traite = true;
    demande.DG_response_date = new Date().toISOString();
    demande.response = true;
    await demande.save({ transaction });

    // Récupération de la dernière cotisation payée
    const lastCotisation = await CotisationEmployeur.findOne({
      where: {
        employeurId: demande.employeur.id,
        is_paid: true
      },
      order: [['paid_date', 'DESC']],
      transaction
    });

    if (!lastCotisation) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Aucune cotisation payée trouvée' });
    }

    // Calcul de la période pour E-20
    if (categorie === "E-20") {
      const paidDateStr = new Date(lastCotisation.paid_date).toLocaleDateString('fr');
      numberOfMonth = utility.joursRestantsE20(paidDateStr);
    }

    // Génération du quitus PDF
    demande.date_gen_quitus = new Date().toISOString();
    const lastPaiementDate = new Date(lastCotisation.paid_date).toLocaleDateString('fr');
    const expireDate = utility.ajouterMoisSelonCategorie(lastPaiementDate, categorie);
    const saveExpireDate = expireDate.split('/');
    demande.quitus_expire_date = new Date(`${saveExpireDate[2]}-${saveExpireDate[1]}-${saveExpireDate[0]}`).toISOString();
    
    const code = utility.secretCode();
    const fileName = `QUITUS-${demande.id}-${ref}`;
    await getQuittusFile(demande.employeur, code, fileName, categorie, ref, lastPaiementDate, expireDate, numberOfMonth, employes.length);

    // Mise à jour finale
    demande.quitus_path = `/api/v1/docsx/${fileName}.pdf`;
    demande.reference = ref;
    await demande.save({ transaction });

    // Création du quitus dans la table Quitus
    await Quitus.create({
      reference: ref,
      secret_code: code,
      path: `/api/v1/docsx/${fileName}.pdf`,
      employeurId: demande.employeur.id,
      demandeId: demande.id,
      quitus_expire_date: demande.quitus_expire_date
    }, { transaction });

    // Commit transaction
    await transaction.commit();

    // Envoi email de notification (non bloquant)
    try {
      await SendDemandeMail(demande.user, demande);
    } catch (emailError) {
      console.error('[DEMANDE_VALIDE] Email error (non-blocking):', emailError);
    }

    return res.status(200).json({ message: 'Reponse' });
  } catch (error) {
    await transaction.rollback();
    console.error('[DEMANDE_VALIDE] Error:', error);
    return res.status(400).json({ message: 'Erreur' });
  }
});

/**
 * POST /api/v1/demande/dirga_traite/:id
 * 
 * Marque une demande comme traitée par DIRGA avec un résumé de traitement.
 * Middleware: verifyToken (DIRGA)
 */
router.post('/dirga_traite/:id', verifyToken, async (req, res) => {
  try {
    const demandeId = parseInt(req.params.id);
    const { resume } = req.body;

    if (isNaN(demandeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    if (!resume) {
      return res.status(400).json({ message: 'Résumé de traitement requis' });
    }

    const demande = await Demande.findByPk(demandeId, {
      include: [{ association: 'employeur' }]
    });

    if (!demande) {
      return res.status(404).json({ message: 'Demande non trouvée' });
    }

    Demande.dirga_traite = true;
    Demande.resume_traitement = resume;
    Demande.dirgaId = req.user.id;
    Demande.send_rapport_date = new Date().toISOString();
    await Demande.save();

    return res.status(200).json({ message: 'traitement ok' });
  } catch (error) {
    console.error('[DEMANDE_DIRGA_TRAITE] Error:', error);
    return res.status(400).json({ message: 'Erreur veuillez reessayer plus tard' });
  }
});

/**
 * POST /api/v1/demande/reject_demande/:id
 * 
 * Rejette une demande avec un motif (sans envoyer d'email).
 * Middleware: verifyToken (DG)
 */
router.post('/reject_demande/:id', verifyToken, async (req, res) => {
  try {
    const demandeId = parseInt(req.params.id);
    const { motif_message } = req.body;

    if (isNaN(demandeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    if (!motif_message) {
      return res.status(400).json({ message: 'Motif de rejet requis' });
    }

    const demande = await Demande.findByPk(demandeId, {
      include: [
        { association: 'employeur' },
        { association: 'user' }
      ]
    });

    if (!demande) {
      return res.status(404).json({ message: 'Demande non trouvée' });
    }

    demande.DG_reject_motif = motif_message;
    demande.DG_response_date = new Date().toISOString();
    demande.DG_traite = true;
    await demande.save();

    return res.status(200).json({ message: 'okok' });
  } catch (error) {
    console.error('[DEMANDE_REJECT] Error:', error);
    return res.status(400).json({ message: 'Erreur veuillez reessayer' });
  }
});

/**
 * POST /api/v1/demande/send_reject_mail/:id
 * 
 * Rejette une demande et envoie un email de notification à l'employeur.
 * Middleware: verifyToken (DG)
 * CORRIGÉ: Virgule remplacée par point-virgule
 */
router.post('/send_reject_mail/:id', verifyToken, async (req, res) => {
  try {
    const demandeId = parseInt(req.params.id);
    const { motif_message } = req.body;

    if (isNaN(demandeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    if (!motif_message) {
      return res.status(400).json({ message: 'Motif de rejet requis' });
    }

    const demande = await Demande.findByPk(demandeId, {
      include: [{ association: 'user' }]
    });

    if (!demande) {
      return res.status(404).json({ message: 'Demande non trouvée' });
    }

    demande.motif_reject = motif_message;
    demande.response = true; // CORRIGÉ: Point-virgule au lieu de virgule
    demande.status = 'Rejétée';
    demande.response_date = new Date().toISOString();
    await demande.save();

    try {
      await SendDemandeMail(demande.user, demande);
    } catch (emailError) {
      console.error('[DEMANDE_SEND_REJECT_MAIL] Email error (non-blocking):', emailError);
    }

    return res.status(200).json({ message: 'operation ok' });
  } catch (error) {
    console.error('[DEMANDE_SEND_REJECT_MAIL] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/v1/demande/re_send/:id
 * 
 * Renvoie une demande rejetée à la Direction Générale pour retraitement.
 * Middleware: verifyToken (DIRGA)
 */
router.post('/re_send/:id', verifyToken, async (req, res) => {
  try {
    const demandeId = parseInt(req.params.id);
    const { resume } = req.body;

    if (isNaN(demandeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    if (!resume) {
      return res.status(400).json({ message: 'Résumé de traitement requis' });
    }

    const demande = await Demande.findByPk(demandeId);

    if (!demande) {
      return res.status(404).json({ message: 'Demande non trouvée' });
    }

    demande.is_re_send = true;
    demande.DG_traite = false; // Réinitialise le traitement DG
    demande.DG_reject_motif = null; // Efface le motif de rejet
    demande.resume_traitement = resume;
    demande.send_rapport_date = new Date().toISOString();
    await demande.save();

    return res.status(200).json({ message: 'ok' });
  } catch (error) {
    console.error('[DEMANDE_RE_SEND] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/v1/demande/hide_resend/:id
 * 
 * Masque l'option de renvoi pour une demande.
 * Middleware: verifyToken
 */
router.post('/hide_resend/:id', verifyToken, async (req, res) => {
  try {
    const demandeId = parseInt(req.params.id);
    if (isNaN(demandeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const demande = await Demande.findByPk(demandeId);

    if (!demande) {
      return res.status(404).json({ message: 'Demande non trouvée' });
    }

    demande.hide_re_send = true;
    await demande.save();

    return res.status(200).json({ message: 'ok' });
  } catch (error) {
    console.error('[DEMANDE_HIDE_RESEND] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/v1/demande/is_delivred/:id
 * 
 * Marque un quitus comme délivré.
 * Middleware: verifyToken
 */
router.post('/is_delivred/:id', verifyToken, async (req, res) => {
  try {
    const demandeId = parseInt(req.params.id);
    if (isNaN(demandeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const demande = await Demande.findByPk(demandeId);

    if (!demande) {
      return res.status(404).json({ message: 'Demande non trouvée' });
    }

    demande.is_delivred = true;
    demande.date_delivry = new Date().toISOString();
    await demande.save();

    return res.status(200).json({ message: 'ok' });
  } catch (error) {
    console.error('[DEMANDE_IS_DELIVRED] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/v1/demande/send_to_dirga/:id
 * 
 * Envoie une demande à DIRGA avec un fichier rapport.
 * Middleware: verifyToken, upload.fields([...])
 */
router.post('/send_to_dirga/:id', verifyToken, upload.fields(rapportFileField), async (req, res) => {
  try {
    const demandeId = parseInt(req.params.id);
    const files = req.files;

    if (isNaN(demandeId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    // Vérification du fichier rapport
    const rapportFilePath = files['rapport_file']?.[0]?.path || null;
    if (!rapportFilePath) {
      return res.status(400).json({ message: 'Fichier rapport obligatoire' });
    }

    const demande = await Demande.findByPk(demandeId, {
      include: [
        { association: 'employeur' },
        { association: 'user' }
      ]
    });

    if (!demande) {
      return res.status(404).json({ message: 'Demande non trouvée' });
    }

    demande.rapport_file = rapportFilePath;
    demande.is_send_to_dirga = true;
    await demande.save();

    try {
      await SendDemandeMail(demande.user, demande);
    } catch (emailError) {
      console.error('[DEMANDE_SEND_TO_DIRGA] Email error (non-blocking):', emailError);
    }

    return res.status(200).json({ message: 'ok' });
  } catch (error) {
    console.error('[DEMANDE_SEND_TO_DIRGA] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

// ============================================
// 3. CONSULTATION DES DEMANDES
// ============================================

/**
 * GET /api/v1/demande/get_all_demande_and_declaration
 * 
 * Récupère toutes les demandes traitées par DIRGA, triées par priorité et date.
 * Middleware: verifyToken (DIRGA/DG)
 * OPTIMISÉ: Ajout de la pagination
 */
router.get('/get_all_demande_and_declaration', verifyToken, async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const result = await Demande.findAndCountAll({
      where: { dirga_traite: true },
      include: [
        { association: 'employeur' },
        { association: 'dirga' },
        { association: 'user' }
      ],
      order: [
        ['priority', 'ASC'],
        ['createdAt', 'ASC']
      ],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[DEMANDE_GET_ALL_AND_DECLARATION] Error:', error);
    return res.status(400).json({ message: 'Erreur' });
  }
});

/**
 * GET /api/v1/demande/get_all_demande_dirga
 * 
 * Récupère toutes les demandes (pour DIRGA).
 * Middleware: verifyToken (DIRGA)
 * OPTIMISÉ: Ajout de la pagination
 */
router.get('/get_all_demande_dirga', verifyToken, async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const result = await Demande.findAndCountAll({
      include: [{ association: 'employeur' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[DEMANDE_GET_ALL_DIRGA] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * GET /api/v1/demande/dqe_file/:reference
 * 
 * Récupère une demande par sa référence (pour télécharger le quitus).
 * Middleware: verifyToken
 */
router.get('/dqe_file/:reference', verifyToken, async (req, res) => {
  try {
    const reference = req.params.reference.trim();

    if (!reference) {
      return res.status(400).json({ message: 'Référence manquante' });
    }

    const demande = await Demande.findOne({
      where: { reference: reference },
      include: [{ association: 'employeur' }]
    });

    if (!demande) {
      return res.status(400).json({ message: 'non trouvé' });
    }

    return res.status(200).json(demande);
  } catch (error) {
    console.error('[DEMANDE_DQE_FILE] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

// ============================================
// 4. VÉRIFICATION PUBLIQUE DU QUITUS
// ============================================

/**
 * GET /api/v1/demande/verify_quitus
 * 
 * Vérifie l'authenticité d'un quitus en utilisant sa référence et son code secret.
 * Middleware: Aucun (route publique)
 */
router.get('/verify_quitus', async (req, res) => {
  try {
    const { reference, secret_code } = req.query;

    // Validation des paramètres
    if (!reference || !secret_code) {
      return res.status(400).json({ message: 'Réference ou code secret null' });
    }

    // Recherche du quitus
    const quitus_detail = await Quitus.findOne({
      where: {
        reference: reference.trim(),
        secret_code: secret_code.trim()
      }
    });

    if (!quitus_detail) {
      return res.status(404).json({ message: "Aucun quitus n'est assigné a ces informations" });
    }

    // Vérification de l'expiration
    const isExpire = utility.estExpiree(quitus_detail.quitus_expire_date);
    if (isExpire) {
      return res.status(400).json({ message: "Quitus expiré" });
    }

    // Récupération des informations
    const demande = await Demande.findByPk(quitus_detail.demandeId, {
      include: [{ association: 'employeur' }]
    });

    if (!demande) {
      return res.status(404).json({ message: 'Demande non trouvée' });
    }

    const employeur = demande.employeur;
    const numberEmploye = await Employe.count({ where: { employeurId: employeur.id } });

    // Récupération de la dernière cotisation
    const lastCotisation = await CotisationEmployeur.findOne({
      where: {
        employeurId: employeur.id,
        is_paid: true
      },
      order: [['paid_date', 'DESC']]
    });

    // Détermination du statut
    let statut = "À jour à la CNSS";
    if (demande.letter_file) {
      statut = "Accord trouvé avec la CNSS";
    }

    return res.status(200).json({
      numero_immatriculation: employeur.no_immatriculation,
      raison_sociale: employeur.raison_sociale,
      date_creation: employeur.date_creation,
      nombres_employés: numberEmploye,
      statut: statut,
      last_paiement: lastCotisation?.paid_date || null
    });
  } catch (error) {
    console.error('[DEMANDE_VERIFY_QUITUS] Error:', error);
    return res.status(500).json({ message: 'Erreur interne' });
  }
});

module.exports = router;
