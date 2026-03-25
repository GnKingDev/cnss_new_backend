const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

const Adhesion = require('./model');
const Employeur = require('../XYemployeurs/model');
const RequestEmployeur = require('../request_employeur/model');
const Users = require('../users/model');

const employeurUtility = require('../XYemployeurs/utility');
const userUtility = require('../users/utility');
const { sendMailAdhesion } = require('../../utility2');
const { getPenality } = require('../../old.db');

// ─── Raccourcis ─────────────────────────────────────────────────────────────
const verifyToken  = employeurUtility.verifyToken;
const generateCode = employeurUtility.generateUniqueCode;
const hashPassword = userUtility.hashPassword;

// Multer — champs de fichiers pour l'adhésion
const uploadAdhesion = employeurUtility.upload.fields([
  { name: 'rccm_file', maxCount: 1 },
  { name: 'nif_file',  maxCount: 1 },
]);

// ============================================================
//  LOGIQUE CENTRALE DE VALIDATION
//  Réutilisée par le BO et la route DIRGA
// ============================================================
async function executeValidation(adhesionRecord, whoValidId) {
  // 1. Créer le représentant (request_employeur)
  const requester = await RequestEmployeur.create({
    first_name: adhesionRecord.first_name || '',
    last_name:  adhesionRecord.last_name  || '',
  });

  // 2. Créer l'employeur avec tous les champs de l'adhésion
  const newEmployeur = await Employeur.create({
    is_insert_oldDB:  true,
    is_immatriculed:  true,
    is_new_compamy:   false,
    request_employeurId: requester.id,

    // Identification
    raison_sociale:      adhesionRecord.raison_sociale,
    sigle:               adhesionRecord.sigle         || null,
    no_immatriculation:  adhesionRecord.no_immatriculation,
    no_rccm:             adhesionRecord.no_rccm        || '',
    no_dni:              adhesionRecord.no_dni          || '',
    no_agrement:         adhesionRecord.no_agrement    || null,
    no_compte:           adhesionRecord.no_compte      || null,
    forme_juridique:     adhesionRecord.forme_juridique || null,
    category:            adhesionRecord.category        || 'E-20',
    secondary_activity:  adhesionRecord.secondary_activity || null,

    // Contact
    email:        adhesionRecord.email,
    phone_number: adhesionRecord.phone_number,
    adresse:      adhesionRecord.address || '',
    fax:          adhesionRecord.fax     || null,
    bp:           adhesionRecord.bp      || null,
    agence:       adhesionRecord.agence  || null,
    description:  adhesionRecord.description || null,

    // Localisation
    prefectureId: adhesionRecord.prefectureId || null,
    brancheId:    adhesionRecord.brancheId    || null,

    // Effectifs
    effectif_femme:     adhesionRecord.effectif_femme     || 0,
    effectif_homme:     adhesionRecord.effectif_homme     || 0,
    effectif_apprentis: adhesionRecord.effectif_apprentis || 0,
    effectif_total: (adhesionRecord.effectif_femme || 0)
                  + (adhesionRecord.effectif_homme || 0)
                  + (adhesionRecord.effectif_apprentis || 0),

    // Données financières
    salaire_initail:            adhesionRecord.salaire_initail            || 0,
    chiffre_affaire_principale: adhesionRecord.chiffre_affaire_principale || null,
    chiffre_affaire_secondaire: adhesionRecord.chiffre_affaire_secondaire || null,

    // Dates
    date_creation:        adhesionRecord.date_creation        || null,
    date_first_embauche:  adhesionRecord.date_first_embauche  || null,
    date_immatriculation: adhesionRecord.date_immatriculation || null,

    // Validation
    who_valide: whoValidId || null,
  });

  // 3. Créer le compte utilisateur (portail employeur)
  const plainPassword = generateCode(9);
  const hashedPassword = await hashPassword(plainPassword);

  const newUser = await Users.create({
    user_identify: adhesionRecord.no_immatriculation,
    identity:      adhesionRecord.no_immatriculation,
    role:          'employeur',
    type:          'employeur',
    first_login:   true,
    user_id:       newEmployeur.id,
    password:      hashedPassword,
    full_name:     `${adhesionRecord.first_name || ''} ${adhesionRecord.last_name || ''}`.trim(),
    email:         adhesionRecord.email,
    phone_number:  adhesionRecord.phone_number,
  });

  // 4. Intégration Paylican (non-bloquant)
  try {
    newUser.first_name = adhesionRecord.first_name;
    newUser.last_name  = adhesionRecord.last_name;
    await employeurUtility.addingUserPaylican(newUser, newEmployeur);
  } catch (paylicanErr) {
    console.error('[adhesion/validate] Paylican error (non-bloquant):', paylicanErr.message);
  }

  // 5. Envoi de l'email avec le mot de passe (non-bloquant)
  sendMailAdhesion(adhesionRecord, plainPassword).catch((mailErr) => {
    console.error('[adhesion/validate] Email error (non-bloquant):', mailErr.message);
  });

  // 6. Mettre à jour l'adhésion
  await adhesionRecord.update({
    is_valid:   true,
    active_btn: true,
    valid_date: new Date(),
    who_valid:  whoValidId || null,
  });

  // 7. Récupérer les pénalités depuis l'ancienne BDD (non-bloquant)
  getPenality(newEmployeur.id, newEmployeur.no_immatriculation).catch((err) => {
    console.error('[adhesion/validate] getPenality error (non-bloquant):', err.message);
  });

  return { newEmployeur, newUser };
}

// ============================================================
//  ROUTE PUBLIQUE — Portail employeur
// ============================================================

/**
 * POST /create_adhesion
 * Soumission d'une demande d'adhésion (sans authentification)
 */
router.post('/create_adhesion', async (req, res) => {
  try {
    const data = req.body.data || req.body;

    if (!data.no_immatriculation) {
      return res.status(400).json({ message: 'Le numéro d\'immatriculation est requis' });
    }

    const existing = await Adhesion.findOne({
      where: { no_immatriculation: data.no_immatriculation },
    });
    if (existing) {
      return res.status(400).json({ message: 'Cet employeur a déjà adhéré' });
    }

    await Adhesion.create(data);
    res.status(200).json({ message: 'Adhésion effectuée avec succès' });
  } catch (error) {
    console.error('[adhesion/create_adhesion]', error);
    res.status(400).json({ message: 'Erreur, veuillez réessayer' });
  }
});

// ============================================================
//  ROUTES COMPATIBLES DIRGA ANGULAR (ancien format)
// ============================================================

/**
 * GET /all_adhesion
 * Liste toutes les adhésions (DIRGA Angular)
 */
router.get('/all_adhesion', verifyToken, async (_req, res) => {
  try {
    const allAdhesion = await Adhesion.findAll({ order: [['createdAt', 'DESC']] });
    res.status(200).json(allAdhesion);
  } catch (error) {
    console.error('[adhesion/all_adhesion]', error);
    res.status(400).json({ message: 'Erreur' });
  }
});

/**
 * POST /validate_adhesion/:id
 * Validation complète — crée employeur + compte + email (DIRGA Angular)
 */
router.post('/validate_adhesion/:id', verifyToken, async (req, res) => {
  try {
    const adhesionRecord = await Adhesion.findByPk(req.params.id);

    if (!adhesionRecord) {
      return res.status(404).json({ message: 'Adhésion introuvable' });
    }
    if (adhesionRecord.is_valid) {
      return res.status(400).json({ message: 'Cette adhésion est déjà validée' });
    }
    if (!adhesionRecord.active_btn) {
      return res.status(400).json({ message: 'Adhésion non activée. Veuillez d\'abord l\'activer.' });
    }

    await executeValidation(adhesionRecord, req.user?.id);
    res.status(200).json({ message: 'Adhésion effectuée avec succès' });
  } catch (error) {
    console.error('[adhesion/validate_adhesion]', error);
    res.status(400).json({ message: error.message || 'Erreur lors de la validation' });
  }
});

/**
 * POST /update_adhesion/:id
 * Mise à jour des informations de contact + active_btn (DIRGA Angular)
 */
router.post('/update_adhesion/:id', verifyToken, async (req, res) => {
  try {
    const adhesionRecord = await Adhesion.findByPk(req.params.id);
    if (!adhesionRecord) {
      return res.status(404).json({ message: 'Adhésion introuvable' });
    }

    await adhesionRecord.update({
      email:        req.body.email        ?? adhesionRecord.email,
      phone_number: req.body.phone_number ?? adhesionRecord.phone_number,
      address:      req.body.adresse      ?? req.body.address ?? adhesionRecord.address,
      category:     req.body.category     ?? adhesionRecord.category,
      first_name:   req.body.first_name   ?? adhesionRecord.first_name,
      last_name:    req.body.last_name    ?? adhesionRecord.last_name,
      active_btn:   true,
    });

    res.status(200).json({ message: 'Mise à jour effectuée' });
  } catch (error) {
    console.error('[adhesion/update_adhesion]', error);
    res.status(400).json({ message: 'Erreur lors de la mise à jour' });
  }
});

// ============================================================
//  ROUTES BO CNSS (nouveau format paginé)
// ============================================================

/**
 * GET /stats
 * Statistiques des adhésions
 */
router.get('/stats', verifyToken, async (_req, res) => {
  try {
    const total      = await Adhesion.count();
    const traite     = await Adhesion.count({ where: { is_valid: true } });
    const non_traite = await Adhesion.count({ where: { is_valid: false } });

    const all = await Adhesion.findAll({ attributes: ['category'] });
    const categoryMap = {};
    all.forEach((a) => {
      const cat = a.category || 'Non défini';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });
    const byCategory = Object.entries(categoryMap).map(([category, count]) => ({
      category,
      count,
    }));

    res.json({ success: true, data: { total, traite, non_traite, byCategory } });
  } catch (error) {
    console.error('[adhesion/stats]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /
 * Liste paginée avec filtres et recherche (BO CNSS)
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const {
      status,
      search,
      category,
      page      = 1,
      limit     = 10,
      sortBy    = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    if (status === 'traite')     where.is_valid = true;
    else if (status === 'non_traite') where.is_valid = false;

    if (category) where.category = category;

    if (search) {
      where[Op.or] = [
        { raison_sociale:      { [Op.like]: `%${search}%` } },
        { no_immatriculation:  { [Op.like]: `%${search}%` } },
        { email:               { [Op.like]: `%${search}%` } },
        { first_name:          { [Op.like]: `%${search}%` } },
        { last_name:           { [Op.like]: `%${search}%` } },
      ];
    }

    const pageNum  = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset   = (pageNum - 1) * limitNum;

    const allowedSort = ['raison_sociale', 'no_immatriculation', 'createdAt', 'category'];
    const orderField  = allowedSort.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir    = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const { count, rows } = await Adhesion.findAndCountAll({
      where,
      limit:  limitNum,
      offset,
      order:  [[orderField, orderDir]],
    });

    res.json({
      success: true,
      data: {
        adhesions: rows,
        pagination: {
          page:       pageNum,
          limit:      limitNum,
          total:      count,
          totalPages: Math.ceil(count / limitNum),
        },
      },
    });
  } catch (error) {
    console.error('[adhesion/list]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /:id
 * Récupérer une adhésion par son ID (BO CNSS)
 */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const adhesionRecord = await Adhesion.findByPk(req.params.id);
    if (!adhesionRecord) {
      return res.status(404).json({ success: false, error: 'Adhésion non trouvée' });
    }
    res.json({ success: true, data: adhesionRecord });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /:id/upload
 * Upload des fichiers rccm_file et nif_file (BO CNSS)
 */
router.post('/:id/upload', verifyToken, uploadAdhesion, async (req, res) => {
  try {
    const adhesionRecord = await Adhesion.findByPk(req.params.id);
    if (!adhesionRecord) {
      return res.status(404).json({ success: false, error: 'Adhésion non trouvée' });
    }

    const updates = {};
    if (req.files?.rccm_file?.[0]) {
      updates.rccm_file = `/uploads/${req.files.rccm_file[0].filename}`;
    }
    if (req.files?.nif_file?.[0]) {
      updates.nif_file = `/uploads/${req.files.nif_file[0].filename}`;
    }

    if (Object.keys(updates).length > 0) {
      await adhesionRecord.update(updates);
    }

    res.json({ success: true, data: adhesionRecord });
  } catch (error) {
    console.error('[adhesion/:id/upload]', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /:id/validate
 * Validation complète depuis le BO CNSS
 */
router.post('/:id/validate', verifyToken, async (req, res) => {
  try {
    const adhesionRecord = await Adhesion.findByPk(req.params.id);

    if (!adhesionRecord) {
      return res.status(404).json({ success: false, error: 'Adhésion non trouvée' });
    }
    if (adhesionRecord.is_valid) {
      return res.status(400).json({ success: false, error: 'Cette adhésion est déjà validée' });
    }
    if (!adhesionRecord.active_btn) {
      return res.status(400).json({
        success: false,
        error: 'Adhésion non activée. Veuillez d\'abord l\'activer via "Mettre à jour".',
      });
    }

    // Vérification des champs obligatoires avant création de l'Employeur
    const missing = [];
    if (!adhesionRecord.no_rccm)           missing.push('N° RCCM');
    if (!adhesionRecord.rccm_file)          missing.push('Fichier RCCM');
    if (!adhesionRecord.nif_file)           missing.push('Fichier NIF');
    if (!adhesionRecord.forme_juridique)    missing.push('Forme juridique');
    if (!adhesionRecord.date_first_embauche) missing.push('Date 1ère embauche');
    if (!adhesionRecord.prefectureId)       missing.push('Préfecture');
    if (!adhesionRecord.brancheId)          missing.push('Branche');
    if (adhesionRecord.effectif_homme === null || adhesionRecord.effectif_homme === undefined) missing.push('Effectif hommes');
    if (adhesionRecord.effectif_femme === null || adhesionRecord.effectif_femme === undefined) missing.push('Effectif femmes');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Champs obligatoires manquants : ${missing.join(', ')}`,
        missing,
      });
    }

    await executeValidation(adhesionRecord, req.user?.id);

    res.json({ success: true, data: adhesionRecord, message: 'Adhésion validée avec succès' });
  } catch (error) {
    console.error('[adhesion/:id/validate]', error);
    res.status(400).json({ success: false, error: error.message || 'Erreur lors de la validation' });
  }
});

/**
 * POST /:id/reject
 * Annuler / rejeter une adhésion (BO CNSS)
 */
router.post('/:id/reject', verifyToken, async (req, res) => {
  try {
    const adhesionRecord = await Adhesion.findByPk(req.params.id);
    if (!adhesionRecord) {
      return res.status(404).json({ success: false, error: 'Adhésion non trouvée' });
    }

    await adhesionRecord.update({
      is_valid:   false,
      valid_date: null,
      who_valid:  null,
    });

    res.json({ success: true, data: adhesionRecord });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * PUT /:id
 * Mise à jour manuelle des informations (BO CNSS)
 */
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const adhesionRecord = await Adhesion.findByPk(req.params.id);
    if (!adhesionRecord) {
      return res.status(404).json({ success: false, error: 'Adhésion non trouvée' });
    }

    const allowed = [
      // Représentant
      'first_name', 'last_name',
      // Identification
      'raison_sociale', 'sigle', 'no_rccm', 'no_dni', 'no_agrement', 'no_compte',
      'forme_juridique', 'category', 'main_activity', 'secondary_activity',
      // Contact
      'email', 'phone_number', 'address', 'fax', 'bp', 'agence', 'description',
      // Localisation
      'prefectureId', 'brancheId',
      // Effectifs
      'effectif_homme', 'effectif_femme', 'effectif_apprentis',
      // Financier
      'salaire_initail', 'chiffre_affaire_principale', 'chiffre_affaire_secondaire',
      // Dates
      'date_creation', 'date_first_embauche', 'date_immatriculation',
      // Workflow
      'active_btn',
    ];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    await adhesionRecord.update(updates);
    res.json({ success: true, data: adhesionRecord });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /:id
 * Supprimer une adhésion (BO CNSS)
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const adhesionRecord = await Adhesion.findByPk(req.params.id);
    if (!adhesionRecord) {
      return res.status(404).json({ success: false, error: 'Adhésion non trouvée' });
    }
    if (adhesionRecord.is_valid) {
      return res.status(400).json({
        success: false,
        error: 'Impossible de supprimer une adhésion validée',
      });
    }
    await adhesionRecord.destroy();
    res.json({ success: true, message: 'Adhésion supprimée avec succès' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
