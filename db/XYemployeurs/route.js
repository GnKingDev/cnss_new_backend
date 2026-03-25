const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const sequelize = require('../db.connection');

const Employeur = require('./model');
const RequestEmployeur = require('../request_employeur/model');
const Employe = require('../employe/model');
const Document = require('../document/model');
const Demande = require('../demandes/model');
const Users = require('../users/model');
const Prefecture = require('../prefecture/model');
const Branche = require('../branches/model');
const CotisationEmployeur = require('../cotisation_employeur/model');
const Demploye = require('../declaration-employe/model');
const Paiement = require('../paiement/model');
const utility = require('./utility');
const userUtility = require('../users/utility');

let generelistDeclaration, genereComptePdf, exportDeclaration;
try {
  const util3 = require('../../utility3');
  generelistDeclaration = util3.generelistDeclaration;
  genereComptePdf = util3.genereComptePdf;
} catch (e) {
  generelistDeclaration = () => Promise.reject(new Error('generelistDeclaration non disponible'));
  genereComptePdf = () => Promise.reject(new Error('genereComptePdf non disponible'));
}
try {
  const util2 = require('../../utility2');
  exportDeclaration = util2.exportDeclaration;
} catch (e) {
  exportDeclaration = () => Promise.reject(new Error('exportDeclaration non disponible'));
}

let addJob;
try {
  addJob = require('../../config.queue').addJob;
} catch (err) {
  addJob = async () => null;
}

// ============================================
// HELPERS & VALIDATORS
// ============================================

// Parse pagination parameters with validation
const getPaginationParams = (req) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  
  return { page, limit, offset };
};

// Format paginated response
const formatPaginatedResponse = (data, total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      currentPage: page,
      totalPages: totalPages || 0,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1 
    }
  };
};

// Validate email format
const isValidEmail = (email) => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate phone number format (Guinea format: starts with 6)
const isValidPhoneNumber = (phone) => {
  if (!phone) return false;
  const phoneRegex = /^6\d{8}$/;
  return phoneRegex.test(phone.replace(/\s+/g, ''));
};

// Validate required fields for employeur
const validateEmployeurData = (data) => {
  const errors = [];
  
  if (!data.raison_sociale || data.raison_sociale.trim().length < 2) {
    errors.push('Raison sociale requise (minimum 2 caractères)');
  }
  
  if (data.email && !isValidEmail(data.email)) {
    errors.push('Format email invalide');
  }
  
  if (data.phone_number && !isValidPhoneNumber(data.phone_number)) {
    errors.push('Format numéro de téléphone invalide (doit commencer par 6 et contenir 9 chiffres)');
  }
  
  if (data.prefecture && !Number.isInteger(parseInt(data.prefecture))) {
    errors.push('Préfecture invalide');
  }
  
  if (data.main_activity && !Number.isInteger(parseInt(data.main_activity))) {
    errors.push('Activité principale invalide');
  }
  
  return errors;
};

// Validate required fields for requester
const validateRequesterData = (data) => {
  const errors = [];
  
  if (!data.first_name || data.first_name.trim().length < 2) {
    errors.push('Prénom du demandeur requis (minimum 2 caractères)');
  }
  
  if (!data.last_name || data.last_name.trim().length < 2) {
    errors.push('Nom du demandeur requis (minimum 2 caractères)');
  }
  
  if (data.email && !isValidEmail(data.email)) {
    errors.push('Format email du demandeur invalide');
  }
  
  if (data.phone_number && !isValidPhoneNumber(data.phone_number)) {
    errors.push('Format numéro de téléphone du demandeur invalide');
  }
  
  return errors; 
};

// Validate file types
const validateFileType = (file, allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']) => {
  if (!file) return true; // Optional file
  return allowedTypes.includes(file.mimetype);
};

// Validate file size (max 5MB)
const validateFileSize = (file, maxSize = 5 * 1024 * 1024) => {
  if (!file) return true; // Optional file
  return file.size <= maxSize;
};

// Safe JSON parse with error handling
const safeJsonParse = (str, defaultValue = null) => {
  try {
    return JSON.parse(str);
  } catch (error) {
    console.error('JSON parse error:', error);
    return defaultValue;
  }
};

// Error handler wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ============================================
// 1. SOUMISSION DE DEMANDES D'IMMATRICULATION
// ============================================

// POST /api/v1/employeur/for_verify_data
router.post('/for_verify_data', asyncHandler(async (req, res) => {
  const { requester, employeur } = req.body;

  // Validate input structure
  if (!requester || !employeur) {
    return res.status(400).json({ 
      message: 'Données requester et employeur requises',
      errors: ['requester et employeur sont obligatoires']
    });
  }

  // Validate requester data
  const requesterErrors = validateRequesterData(requester);
  if (requesterErrors.length > 0) {
    return res.status(400).json({ 
      message: 'Erreurs de validation - Demandeur',
      errors: requesterErrors
    });
  }

  // Validate employeur data
  const employeurErrors = validateEmployeurData(employeur);
  if (employeurErrors.length > 0) {
    return res.status(400).json({ 
      message: 'Erreurs de validation - Employeur',
      errors: employeurErrors
    });
  }

  // Check if email exists for Payeur type user
  if (employeur.email) {
    const existingUser = await Users.findOne({
      where: {
        email: employeur.email,
        type: 'Payeur'
      }
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: 'Email existe déjà dans information sur entreprise',
        field: 'email'
      });
    }
  }

  // Optional: Validate email and phone uniqueness
  try {
    if (employeur.email) {
      await utility.valideEmailFunction(employeur.email, 'employeur');
    }
    if (employeur.phone_number) {
      await utility.ValidatePhoneNumber(employeur.phone_number, 'employeur');
    }
    if (requester.email) {
      await utility.valideEmailFunction(requester.email, 'requester');
    }
    if (requester.phone_number) {
      await utility.ValidatePhoneNumber(requester.phone_number, 'requester');
    }
  } catch (error) {
    return res.status(400).json({ 
      message: error.message,
      field: error.message.includes('email') ? 'email' : 'phone_number'
    });
  }

  return res.status(200).json({ 
    message: 'okoko',
    validated: true
  });
}));

// POST /api/v1/employeur/for_verify
router.post('/for_verify', utility.upload.fields(utility.fileArray), asyncHandler(async (req, res) => {
  const { employeur: employeurStr, requester: requesterStr } = req.body;
  const files = req.files;

  // Validate JSON strings
  if (!employeurStr || !requesterStr) {
    return res.status(400).json({ 
      message: 'Données employeur et requester requises',
      errors: ['employeur et requester doivent être des JSON valides']
    });
  }

  // Parse JSON safely
  const data_employeur = safeJsonParse(employeurStr);
  const data_requester = safeJsonParse(requesterStr);

  if (!data_employeur || !data_requester) {
    return res.status(400).json({ 
      message: 'Format JSON invalide',
      errors: ['Les données employeur et requester doivent être des JSON valides']
    });
  }

  // Validate data
  const employeurErrors = validateEmployeurData(data_employeur);
  const requesterErrors = validateRequesterData(data_requester);
  
  if (employeurErrors.length > 0 || requesterErrors.length > 0) {
    return res.status(400).json({
      message: 'Erreurs de validation',
      errors: {
        employeur: employeurErrors,
        requester: requesterErrors
      }
    });
  }

  // Validate files
  const fileErrors = [];
  const requiredFiles = ['cni', 'rccm_file', 'dni_file'];
  
  for (const fileField of requiredFiles) {
    if (!files[fileField] || !files[fileField][0]) {
      fileErrors.push(`Fichier ${fileField} requis`);
    } else {
      const file = files[fileField][0];
      if (!validateFileType(file)) {
        fileErrors.push(`Type de fichier invalide pour ${fileField} (PDF ou image uniquement)`);
      }
      if (!validateFileSize(file)) {
        fileErrors.push(`Fichier ${fileField} trop volumineux (max 5MB)`);
      }
    }
  }

  if (fileErrors.length > 0) {
    return res.status(400).json({
      message: 'Erreurs de validation des fichiers',
      errors: fileErrors
    });
  }

  // Check if raison_sociale already exists
  const existingEmployeur = await utility.findByRaisonSociale(data_employeur.raison_sociale);
  if (existingEmployeur) {
    return res.status(400).json({ 
      message: 'Cette raison sociale existe déjà',
      field: 'raison_sociale'
    });
  }

  // Verify prefecture and branche exist
  if (data_employeur.prefecture) {
    const prefecture = await Prefecture.findByPk(data_employeur.prefecture);
    if (!prefecture) {
      return res.status(400).json({ 
        message: 'Préfecture non trouvée',
        field: 'prefecture'
      });
    }
  }

  if (data_employeur.main_activity) {
    const branche = await Branche.findByPk(data_employeur.main_activity);
    if (!branche) {
      return res.status(400).json({ 
        message: 'Branche d\'activité non trouvée',
        field: 'main_activity'
      });
    }
  }

  // Use transaction for data integrity
  const transaction = await sequelize.transaction();

  try {
    // Assign file paths
    const fileMapping = {
      'logo': 'logo',
      'rccm_file': 'rccm_file',
      'dni_file': 'dni_file',
      'DPAE_file': 'DPAE_file',
      'requester_picture': 'avatar',
      'cni': 'file'
    };

    for (const [fileField, dataField] of Object.entries(fileMapping)) {
      if (files[fileField] && files[fileField][0]) {
        const file = files[fileField][0];
        if (dataField === 'avatar' || dataField === 'file') {
          data_requester[dataField] = file.path;
        } else {
          data_employeur[dataField] = file.path;
        }
      }
    }

    // Assign relations
    data_employeur.prefectureId = data_employeur.prefecture;
    data_employeur.brancheId = data_employeur.main_activity;
    data_employeur.is_immatriculed = false;
    data_employeur.is_new_compamy = true;

    // Create requester
    const requester = await RequestEmployeur.create(data_requester, { transaction });

    // Assign requester to employeur
    data_employeur.request_employeurId = requester.id;

    // Create employeur
    const newEmployeur = await Employeur.create(data_employeur, { transaction });

    // Commit transaction
    await transaction.commit();

    // Return created employeur with relations
    const employeurWithRelations = await Employeur.findByPk(newEmployeur.id, {
      include: [
        { association: 'request_employeur' },
        { association: 'prefecture' },
        { association: 'branche' }
      ]
    });

    return res.status(201).json({
      message: 'Demande d\'immatriculation soumise avec succès',
      employeur: employeurWithRelations
    });
  } catch (error) {
    // Rollback transaction on error
    await transaction.rollback();
    
    // Clean up uploaded files on error
    if (files) {
      Object.values(files).flat().forEach(file => {
        if (file && file.path) {
          try {
            const fs = require('fs');
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (cleanupError) {
            console.error('Error cleaning up file:', cleanupError);
          }
        }
      });
    }

    console.error('For verify error:', error);
    
    // Handle Sequelize unique constraint errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        message: 'Une donnée unique existe déjà',
        field: error.errors[0]?.path || 'unknown'
      });
    }

    return res.status(400).json({ 
      message: error.message || 'Erreur lors de la création',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// ============================================
// 2. VALIDATION ET IMMATRICULATION (DIRGA)
// ============================================

// GET /api/v1/employeur/all_employeur
router.get('/all_employeur', utility.verifyToken, asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req);
  const { is_immatriculed, search } = req.query;

  // Build where clause
  const whereClause = {};
  if (is_immatriculed !== undefined) {
    whereClause.is_immatriculed = is_immatriculed === 'true';
  }
  if (search) {
    whereClause[Op.or] = [
      { raison_sociale: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
      { no_immatriculation: { [Op.like]: `%${search}%` } }
    ];
  }

  const result = await Employeur.findAndCountAll({
    where: whereClause,
    include: [
      { association: 'request_employeur' },
      { association: 'prefecture' },
      { association: 'branche' }
    ],
    limit,
    offset,
    order: [['createdAt', 'DESC']]
  });

  return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
}));

// POST /api/v1/employeur/validate/:id
router.post('/validate/:id', utility.verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const employeurId = parseInt(id);

  if (isNaN(employeurId)) {
    return res.status(400).json({ message: 'ID employeur invalide' });
  }

  const employeur = await Employeur.findByPk(employeurId, {
    include: [
      { association: 'request_employeur' },
      { association: 'prefecture' },
      { association: 'branche' }
    ]
  });

  if (!employeur) {
    return res.status(404).json({ message: 'Employeur non trouvé' });
  }

  if (employeur.is_immatriculed) {
    return res.status(400).json({ message: 'Cet employeur est déjà immatriculé' });
  }

  // Update employeur status
  await employeur.update({
    is_immatriculed: true,
    who_valide: req.user.id,
    date_immatriculation: new Date()
  });

  await addJob({ type: 'employeur', employeurId: employeurId, user_valid: req.user.id });

  return res.status(200).json({ 
    message: 'Employeur immatriculé avec succès',
    employeur: await Employeur.findByPk(employeurId, {
      include: [
        { association: 'request_employeur' },
        { association: 'prefecture' },
        { association: 'branche' }
      ]
    })
  });
}));

// GET /api/v1/employeur/get_all_emplyeur
router.get('/get_all_emplyeur', utility.verifyToken, asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req);
  const { is_immatriculed, search } = req.query;

  const whereClause = {};
  if (is_immatriculed !== undefined) {
    whereClause.is_immatriculed = is_immatriculed === 'true';
  }
  if (search) {
    whereClause[Op.or] = [
      { raison_sociale: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } }
    ];
  }

  const result = await Employeur.findAndCountAll({
    where: whereClause,
    include: [
      { 
        association: 'employes',
        required: false // Left join to include employers without employees
      }
    ],
    limit,
    offset,
    order: [['createdAt', 'DESC']],
    distinct: true // Important for correct count with includes
  });

  return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
}));

// ============================================
// 3. GESTION DES DOCUMENTS
// ============================================

// GET /api/v1/employeur/document
router.get('/document', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req);
  const { search } = req.query;

  const whereClause = { employeurId: req.user.user_id };
  if (search) {
    whereClause[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { code: { [Op.like]: `%${search}%` } }
    ];
  }

  const result = await Document.findAndCountAll({
    where: whereClause,
    include: [
      { association: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation'] }
    ],
    limit,
    offset,
    order: [['createdAt', 'DESC']]
  });

  return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
}));

// ============================================
// 4. INFORMATIONS DE L'EMPLOYEUR CONNECTÉ
// ============================================

// GET /api/v1/employeur/one
router.get('/one', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const employeur = await Employeur.findOne({
    where: { id: req.user.user_id },
    include: [
      { association: 'request_employeur' },
      { association: 'prefecture' },
      { association: 'branche' }
    ]
  });

  if (!employeur) {
    return res.status(404).json({ message: 'Employeur non trouvé' });
  }

  const user = await Users.findByPk(req.user.id, {
    attributes: { exclude: ['password', 'otp_secret'] }
  });

  return res.status(200).json({ 
    employeur,
    user 
  });
}));

// ============================================
// 5. GESTION DES DEMANDES (QUITUS, ETC.)
// ============================================

// GET /api/v1/employeur/get_all_demandes
router.get('/get_all_demandes', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req);
  const { status, search } = req.query;

  const whereClause = { employeurId: req.user.user_id };
  
  if (status) {
    whereClause.status = status;
  }
  
  if (search) {
    whereClause[Op.or] = [
      { motif: { [Op.like]: `%${search}%` } },
      { reference: { [Op.like]: `%${search}%` } }
    ];
  }

  const result = await Demande.findAndCountAll({
    where: whereClause,
    include: [
      { association: 'user', attributes: ['id', 'full_name', 'email'] },
      { association: 'dirga', attributes: ['id', 'first_name', 'last_name'] }
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });

  return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
}));

// POST /api/v1/employeur/create_demande
router.post('/create_demande', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const { motif } = req.body;

  if (!motif || motif.trim().length < 3) {
    return res.status(400).json({ 
      message: 'Motif requis (minimum 3 caractères)',
      field: 'motif'
    });
  }

  // Verify employeur exists
  const employeur = await Employeur.findByPk(req.user.user_id);
  if (!employeur) {
    return res.status(404).json({ message: 'Employeur non trouvé' });
  }

  // Generate unique reference
  const reference = `DEM-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  const demande = await Demande.create({
    motif: motif.trim(),
    employeurId: req.user.user_id,
    userId: req.user.id,
    reference,
    status: 'En cours de traitement',
    priority: 3
  });

  return res.status(201).json({ 
    message: 'Demande créée avec succès',
    demande: await Demande.findByPk(demande.id, {
      include: [
        { association: 'employeur', attributes: ['id', 'raison_sociale'] }
      ]
    })
  });
}));

// GET /api/v1/employeur/get_all_demandes_dirga
router.get('/get_all_demandes_dirga', utility.verifyToken, asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req);
  const { status, search, employeurId } = req.query;

  const whereClause = {};
  
  if (status) {
    whereClause.status = status;
  }
  
  if (employeurId) {
    whereClause.employeurId = parseInt(employeurId);
  }
  
  if (search) {
    whereClause[Op.or] = [
      { motif: { [Op.like]: `%${search}%` } },
      { reference: { [Op.like]: `%${search}%` } }
    ];
  }

  const result = await Demande.findAndCountAll({
    where: whereClause,
    include: [
      { 
        association: 'employeur',
        attributes: ['id', 'raison_sociale', 'no_immatriculation', 'email']
      },
      { 
        association: 'user',
        attributes: ['id', 'full_name', 'email']
      },
      { 
        association: 'dirga',
        attributes: ['id', 'first_name', 'last_name']
      }
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true
  });

  return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
}));

// ============================================
// 6. GESTION ADMINISTRATIVE (DIRGA)
// ============================================

// POST /api/v1/employeur/update_employeur/:id
router.post('/update_employeur/:id', utility.verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const employeurId = parseInt(id);
  const { email, phone_number, raison_sociale, prefecture_id, branche_id } = req.body;

  if (isNaN(employeurId)) {
    return res.status(400).json({ message: 'ID employeur invalide' });
  }

  const employeur = await Employeur.findByPk(employeurId);
  if (!employeur) {
    return res.status(404).json({ message: 'Employeur non trouvé' });
  }

  // Validate email if provided
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ 
      message: 'Format email invalide',
      field: 'email'
    });
  }

  // Validate phone if provided
  if (phone_number && !isValidPhoneNumber(phone_number)) {
    return res.status(400).json({ 
      message: 'Format numéro de téléphone invalide',
      field: 'phone_number'
    });
  }

  // Check if raison_sociale already exists (if changed)
  if (raison_sociale && raison_sociale !== employeur.raison_sociale) {
    const existing = await utility.findByRaisonSociale(raison_sociale);
    if (existing && existing.id !== employeurId) {
      return res.status(400).json({ 
        message: 'Cette raison sociale existe déjà',
        field: 'raison_sociale'
      });
    }
  }

  // Verify prefecture exists if provided
  if (prefecture_id) {
    const prefecture = await Prefecture.findByPk(prefecture_id);
    if (!prefecture) {
      return res.status(400).json({ 
        message: 'Préfecture non trouvée',
        field: 'prefecture_id'
      });
    }
  }

  // Verify branche exists if provided
  if (branche_id) {
    const branche = await Branche.findByPk(branche_id);
    if (!branche) {
      return res.status(400).json({ 
        message: 'Branche d\'activité non trouvée',
        field: 'branche_id'
      });
    }
  }

  const updateData = {};
  if (email) updateData.email = email.trim();
  if (phone_number) updateData.phone_number = phone_number.trim();
  if (raison_sociale) updateData.raison_sociale = raison_sociale.trim();
  if (prefecture_id) updateData.prefectureId = prefecture_id;
  if (branche_id) updateData.brancheId = branche_id;

  await employeur.update(updateData);

  // Update user if type is admin
  const user = await Users.findOne({ where: { user_id: employeur.id } });
  if (user && user.type === 'admin') {
    const userUpdate = {};
    if (email) userUpdate.email = email.trim();
    if (phone_number) userUpdate.phone_number = phone_number.trim();
    if (Object.keys(userUpdate).length > 0) {
      await user.update(userUpdate);
    }
  }

  // Return updated employeur with relations
  const updatedEmployeur = await Employeur.findByPk(employeurId, {
    include: [
      { association: 'request_employeur' },
      { association: 'prefecture' },
      { association: 'branche' }
    ]
  });

  return res.status(200).json({ 
    message: 'Employeur mis à jour avec succès',
    employeur: updatedEmployeur
  });
}));

// POST /api/v1/employeur/delete_employeur/:id
router.post('/delete_employeur/:id', utility.verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const employeurId = parseInt(id);

  if (isNaN(employeurId)) {
    return res.status(400).json({ message: 'ID employeur invalide' });
  }

  const employeur = await Employeur.findByPk(employeurId);
  if (!employeur) {
    return res.status(404).json({ message: 'Employeur non trouvé' });
  }

  // Check if employeur has related data (optional: prevent deletion if has employees, etc.)
  const employeCount = await Employe.count({ where: { employeurId: employeurId } });
  if (employeCount > 0) {
    return res.status(400).json({ 
      message: 'Impossible de supprimer cet employeur car il a des employés associés',
      employeCount
    });
  }

  // Use transaction for data integrity
  const transaction = await sequelize.transaction();

  try {
    // Delete related request_employeur if exists
    if (employeur.request_employeurId) {
      await RequestEmployeur.destroy({ 
        where: { id: employeur.request_employeurId },
        transaction 
      });
    }

    // Delete employeur
    await employeur.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({ 
      message: 'Employeur supprimé avec succès'
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}));

// ============================================
// ROUTES DE BASE (pour compatibilité)
// ============================================

// GET all employeurs (basic route with pagination)
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req);
  const { search, is_immatriculed, is_active, category, sortBy, sortOrder, status } = req.query;

  const whereClause = {};
  if (search) {
    whereClause[Op.or] = [
      { raison_sociale: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
      { no_immatriculation: { [Op.like]: `%${search}%` } },
      { sigle: { [Op.like]: `%${search}%` } },
    ];
  }
  // Support both ?status=traite|non_traite and ?is_immatriculed=true|false
  if (status === 'traite')     whereClause.is_immatriculed = true;
  else if (status === 'non_traite') whereClause.is_immatriculed = false;
  else if (is_immatriculed !== undefined) whereClause.is_immatriculed = is_immatriculed === 'true';
  if (is_active !== undefined) whereClause.is_active = is_active === 'true';
  if (category) whereClause.category = category;

  const validSortFields = ['raison_sociale', 'effectif_total', 'solde', 'createdAt', 'no_immatriculation'];
  const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
  const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const result = await Employeur.findAndCountAll({
    where: whereClause,
    include: [
      { association: 'prefecture' },
      { association: 'branche' },
    ],
    limit,
    offset,
    order: [[orderField, orderDir]],
  });

  return res.status(200).json({
    success: true,
    data: {
      employeurs: result.rows,
      pagination: {
        total: result.count,
        page,
        limit,
        totalPages: Math.ceil(result.count / limit),
      },
    },
  });
}));

// ============================================
// DASHBOARD ROUTES & PROFIL EMPLOYEUR (TOP BAR)
// Routes à chemin fixe : définies AVANT /:id pour ne pas être capturées comme id.
// ============================================

/**
 * GET /api/v1/employeur/profile
 * Profil employeur (raison sociale, n° immatriculation) + infos utilisateur connecté (nom, rôle).
 * Authentification : EmployeurToken
 */
router.get('/profile', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const start = Date.now();
  const [employeur, user] = await Promise.all([
    Employeur.findByPk(req.user.user_id),
    Users.findByPk(req.user.id, { attributes: ['full_name', 'type'], raw: true })
  ]);

  if (!employeur) {
    return res.status(404).json({ message: 'Employeur non trouvé' });
  }

  const payload = {
    id: employeur.id,
    raison_sociale: employeur.raison_sociale || '',
    no_immatriculation: employeur.no_immatriculation || '',
    cnss_number: employeur.no_immatriculation || '',
    nif: employeur.no_rccm || employeur.no_dni || '',
    no_rccm: employeur.no_rccm || null,
    rccm_file: employeur.rccm_file || null,
    no_dni: employeur.no_dni || null,
    dni_file: employeur.dni_file || null,
    adresse: employeur.adresse || '',
    address: employeur.adresse || '',
    phone_number: employeur.phone_number || '',
    phone: employeur.phone_number || '',
    email: employeur.email || '',
    contact_rh: employeur.description || employeur.sigle || '',
    userFullName: (user && user.full_name) || '',
    userRole: (user && user.type) || 'Administrateur'
  };

  const duration = (Date.now() - start).toFixed(3);
  const contentLength = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  console.log(`GET /api/v1/employeur/profile 200 ${contentLength} - ${duration} ms`);
  console.log('Response profile:', payload);

  return res.status(200).json(payload);
}));

/**
 * PUT /api/v1/employeur/profile
 * Mise à jour des coordonnées de l'employeur (phone_number, email, adresse).
 * Authentification : EmployeurToken
 */
router.put('/profile', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const { phone_number, email, adresse } = req.body;

  const employeur = await Employeur.findByPk(req.user.user_id);
  if (!employeur) {
    return res.status(404).json({ message: 'Employeur non trouvé' });
  }

  // Mise à jour uniquement des champs fournis
  const updateData = {};
  if (phone_number !== undefined) updateData.phone_number = phone_number;
  if (email !== undefined) updateData.email = email;
  if (adresse !== undefined) updateData.adresse = adresse;

  await employeur.update(updateData);

  // Retourner le profil mis à jour
  return res.status(200).json({
    id: employeur.id,
    raison_sociale: employeur.raison_sociale || null,
    no_immatriculation: employeur.no_immatriculation || null,
    category: employeur.category || null,
    phone_number: employeur.phone_number || null,
    email: employeur.email || null,
    adresse: employeur.adresse || null,
    sigle: employeur.sigle || null,
    description: employeur.description || null,
    secondary_activity: employeur.secondary_activity || null,
    effectif_total: employeur.effectif_total || null,
    number_employe: employeur.number_employe || null,
    forme_juridique: employeur.forme_juridique || null,
    no_rccm: employeur.no_rccm || null,
    no_dni: employeur.no_dni || null,
    is_active: employeur.is_active !== undefined ? employeur.is_active : null,
    createdAt: employeur.createdAt || null,
    updatedAt: employeur.updatedAt || null
  });
}));

/**
 * PATCH /api/v1/employeur/profile
 * Alias de PUT pour la mise à jour des coordonnées.
 */
router.patch('/profile', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const { phone_number, email, adresse } = req.body;

  const employeur = await Employeur.findByPk(req.user.user_id);
  if (!employeur) {
    return res.status(404).json({ message: 'Employeur non trouvé' });
  }

  // Mise à jour uniquement des champs fournis
  const updateData = {};
  if (phone_number !== undefined) updateData.phone_number = phone_number;
  if (email !== undefined) updateData.email = email;
  if (adresse !== undefined) updateData.adresse = adresse;

  await employeur.update(updateData);

  // Retourner le profil mis à jour
  return res.status(200).json({
    id: employeur.id,
    raison_sociale: employeur.raison_sociale || null,
    no_immatriculation: employeur.no_immatriculation || null,
    category: employeur.category || null,
    phone_number: employeur.phone_number || null,
    email: employeur.email || null,
    adresse: employeur.adresse || null,
    sigle: employeur.sigle || null,
    description: employeur.description || null,
    secondary_activity: employeur.secondary_activity || null,
    effectif_total: employeur.effectif_total || null,
    number_employe: employeur.number_employe || null,
    forme_juridique: employeur.forme_juridique || null,
    no_rccm: employeur.no_rccm || null,
    no_dni: employeur.no_dni || null,
    is_active: employeur.is_active !== undefined ? employeur.is_active : null,
    createdAt: employeur.createdAt || null,
    updatedAt: employeur.updatedAt || null
  });
}));

/**
 * PATCH /api/v1/employeur/profile/documents
 * Ajout / mise à jour des documents NIF et RCCM (fichiers + numéros).
 * Body: multipart/form-data avec rccm_file?, dni_file?, no_rccm?, no_dni?
 */
const documentsUpload = utility.upload.fields([
  { name: 'rccm_file', maxCount: 1 },
  { name: 'dni_file', maxCount: 1 }
]);
router.patch('/profile/documents', userUtility.EmployeurToken, documentsUpload, asyncHandler(async (req, res) => {
  const employeur = await Employeur.findByPk(req.user.user_id);
  if (!employeur) {
    return res.status(404).json({ message: 'Employeur non trouvé' });
  }
  const updateData = {};
  if (req.body.no_rccm !== undefined) updateData.no_rccm = req.body.no_rccm || null;
  if (req.body.no_dni !== undefined) updateData.no_dni = req.body.no_dni || null;
  const files = req.files || {};
  if (files.rccm_file && files.rccm_file[0]) {
    updateData.rccm_file = `/uploads/${files.rccm_file[0].filename}`;
  }
  if (files.dni_file && files.dni_file[0]) {
    updateData.dni_file = `/uploads/${files.dni_file[0].filename}`;
  }
  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ message: 'Aucune donnée à mettre à jour (joignez des fichiers et/ou no_rccm, no_dni)' });
  }
  await employeur.update(updateData);
  return res.status(200).json({
    id: employeur.id,
    raison_sociale: employeur.raison_sociale || null,
    no_immatriculation: employeur.no_immatriculation || null,
    no_rccm: employeur.no_rccm || null,
    rccm_file: employeur.rccm_file || null,
    no_dni: employeur.no_dni || null,
    dni_file: employeur.dni_file || null,
    message: 'Documents mis à jour'
  });
}));

// ============================================
// GESTION DES UTILISATEURS (Menu Mon compte)
// ============================================

/**
 * GET /api/v1/employeur/users
 * Liste des utilisateurs liés à l'employeur connecté.
 * Authentification : EmployeurToken
 */
router.get('/users', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req);
  
  // Get total count for pagination
  const total = await Users.count({
    where: { user_id: req.user.user_id }
  });

  // Get paginated users
  const users = await Users.findAll({
    where: { user_id: req.user.user_id },
    attributes: { exclude: ['password', 'otp_secret'] },
    limit,
    offset,
    order: [['createdAt', 'DESC']]
  });

  // Sanitize users (retourner les champs nécessaires)
  const sanitizedUsers = users.map(user => ({
    id: user.id,
    full_name: user.full_name || null,
    email: user.email || null,
    phone_number: user.phone_number || null,
    role: user.role || null,
    type: user.type || null,
    can_work: user.can_work !== undefined ? user.can_work : true,
    last_connect_time: user.last_connect_time || null,
    createdAt: user.createdAt || null
  }));

  return res.status(200).json(formatPaginatedResponse(sanitizedUsers, total, page, limit));
}));

/**
 * POST /api/v1/employeur/users
 * Création d'un utilisateur pour l'employeur connecté.
 * Authentification : EmployeurToken
 */
router.post('/users', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const { full_name, email, phone_number, type } = req.body;

  if (!full_name || !email || !phone_number || !type) {
    return res.status(400).json({ message: 'Tous les champs sont requis (full_name, email, phone_number, type)' });
  }

  // Check if user already exists for this employer
  const existingUser = await Users.findOne({
    where: {
      user_id: req.user.user_id,
      [Op.or]: [
        { email },
        { phone_number }
      ]
    }
  });

  if (existingUser) {
    if (existingUser.email === email) {
      return res.status(400).json({ message: 'Email existant' });
    }
    if (existingUser.phone_number === phone_number) {
      return res.status(400).json({ message: 'Numéro de téléphone existant' });
    }
  }

  // Generate random password
  const randomPassword = userUtility.generateUniqueCode(9);
  const hashedPassword = await userUtility.hashPassword(randomPassword);

  // Get employer info first
  const employeur = await Employeur.findByPk(req.user.user_id);
  if (!employeur) {
    return res.status(404).json({ message: 'Employeur non trouvé' });
  }

  // Generate identity (similaire à generateIdentity dans users/route.js)
  const user_identify = employeur.no_immatriculation || String(req.user.user_id);
  const prefix = type === 'Payeur' ? 'P' : 'R';
  const lastUser = await Users.findOne({
    where: {
      user_identify: user_identify,
      identity: { [Op.like]: `${prefix}%` }
    },
    order: [['createdAt', 'DESC']],
    raw: true
  });

  let nextNumber = 1;
  if (lastUser && lastUser.identity) {
    const match = lastUser.identity.match(/\d+$/);
    if (match) {
      nextNumber = parseInt(match[0]) + 1;
    }
  }

  const identity = `${prefix}${nextNumber}`;

  // Generate OTP secret for new user
  const utility2 = require('../../utility2');
  const otpSecret = utility2.generateOtpSecret();

  // Create user
  const newUser = await Users.create({
    user_identify: user_identify,
    identity,
    role: 'employeur',
    type: type,
    password: hashedPassword,
    full_name,
    email,
    phone_number,
    user_id: req.user.user_id,
    otp_secret: otpSecret,
    can_work: true,
    first_login: true
  });

  // Send welcome email
  await utility2.CreateUserMail(newUser, employeur, randomPassword);

  // If Payeur, add to Paylican
  if (type === 'Payeur') {
    const nameParts = full_name.split(' ');
    newUser.first_name = nameParts[0] || '';
    newUser.last_name = nameParts.slice(1).join(' ') || '';
    await newUser.save();

    await utility.addingUserPaylican(newUser, employeur);
  }

  // Retourner l'utilisateur créé (sans password, otp_secret)
  return res.status(201).json({
    id: newUser.id,
    full_name: newUser.full_name || null,
    email: newUser.email || null,
    phone_number: newUser.phone_number || null,
    role: newUser.role || null,
    type: newUser.type || null,
    can_work: newUser.can_work !== undefined ? newUser.can_work : true,
    last_connect_time: newUser.last_connect_time || null,
    createdAt: newUser.createdAt || null
  });
}));

/**
 * PATCH /api/v1/employeur/users/:id
 * Désactiver/réactiver un utilisateur de l'employeur connecté.
 * Authentification : EmployeurToken
 */
router.patch('/users/:id', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = parseInt(id);
  const { can_work } = req.body;

  if (isNaN(userId)) {
    return res.status(400).json({ message: 'ID utilisateur invalide' });
  }

  if (can_work === undefined) {
    return res.status(400).json({ message: 'Le champ can_work est requis' });
  }

  const user = await Users.findByPk(userId);
  if (!user) {
    return res.status(404).json({ message: 'Utilisateur non trouvé' });
  }

  // Vérifier que l'utilisateur appartient à l'employeur connecté
  if (user.user_id !== req.user.user_id) {
    return res.status(403).json({ message: 'Non autorisé : cet utilisateur n\'appartient pas à votre entreprise' });
  }

  // Si Payeur, gérer Paylican
  if (user.type === 'Payeur') {
    if (can_work === false) {
      // Désactiver dans Paylican
      await utility.DeleteDelegateUser(user.identity);
    } else {
      // Réactiver dans Paylican (si nécessaire)
      const employeur = await Employeur.findByPk(req.user.user_id);
      if (employeur) {
        await utility.addingUserPaylican(user, employeur);
      }
    }
  }

  // Mettre à jour can_work
  await user.update({ can_work });

  // Retourner l'utilisateur mis à jour
  return res.status(200).json({
    id: user.id,
    full_name: user.full_name || null,
    email: user.email || null,
    phone_number: user.phone_number || null,
    role: user.role || null,
    type: user.type || null,
    can_work: user.can_work !== undefined ? user.can_work : true,
    last_connect_time: user.last_connect_time || null,
    createdAt: user.createdAt || null
  });
}));

/**
 * GET /api/v1/employeur/dashboard/home
 * Dashboard complet pour l'employeur connecté : KPIs, situation employés, activités récentes, résumé du mois.
 * Authentification : EmployeurToken
 */
router.get('/dashboard/home', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const employeurId = req.user.user_id;
  const employeur = await Employeur.findByPk(employeurId);
  if (!employeur) {
    return res.status(404).json({ message: 'Employeur non trouvé' });
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const startOfPrevMonth = new Date(currentYear, currentMonth - 1, 1);
  const endOfPrevMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
  const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  // 1. Employés
  const totalEmployees = await Employe.count({ where: { employeurId } });
  const employeesAddedThisMonth = await Employe.count({
    where: { employeurId, createdAt: { [Op.gte]: startOfMonth } }
  });
  const actifs = await Employe.count({ where: { employeurId, is_out: false, is_imma: true } });
  const enAttente = await Employe.count({ where: { employeurId, is_imma: false } });
  const retires = await Employe.count({ where: { employeurId, is_out: true } });

  // 2. Cotisations du mois (total_branche ou total_cotisation)
  const cotisationsThisMonth = await CotisationEmployeur.findAll({
    where: { employeurId, createdAt: { [Op.gte]: startOfMonth } },
    attributes: ['total_branche', 'total_cotisation', 'is_paid', 'createdAt'],
    raw: true
  });
  const cotisationsPrevMonth = await CotisationEmployeur.findAll({
    where: { employeurId, createdAt: { [Op.gte]: startOfPrevMonth, [Op.lte]: endOfPrevMonth } },
    attributes: ['total_branche'],
    raw: true
  });
  const totalGnfThisMonth = cotisationsThisMonth.reduce((sum, c) => sum + Number(c.total_branche || c.total_cotisation || 0), 0);
  const totalGnfPrevMonth = cotisationsPrevMonth.reduce((sum, c) => sum + Number(c.total_branche || 0), 0);
  const evolutionPercent = totalGnfPrevMonth > 0
    ? Math.round(((totalGnfThisMonth - totalGnfPrevMonth) / totalGnfPrevMonth) * 1000) / 10
    : (totalGnfThisMonth > 0 ? 100 : 0);

  // Série pour courbe (7 derniers jours)
  const series = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    const dayTotal = await CotisationEmployeur.sum('total_branche', {
      where: { employeurId, createdAt: { [Op.gte]: day, [Op.lt]: nextDay } }
    });
    series.push({ value: Number(dayTotal) || 0 });
  }

  // 3. Déclarations (cotisations)
  const totalDeclarations = await CotisationEmployeur.count({ where: { employeurId, createdAt: { [Op.gte]: startOfMonth } } });
  const validatedDeclarations = await CotisationEmployeur.count({ where: { employeurId, is_paid: true, createdAt: { [Op.gte]: startOfMonth } } });
  const validationRate = totalDeclarations > 0 ? Math.round((validatedDeclarations / totalDeclarations) * 100) : 0;

  // 4. Paiements en attente
  const pendingPayments = await Paiement.findAll({
    where: { employeurId, is_paid: false },
    include: [{ model: CotisationEmployeur, as: 'cotisation_employeur', attributes: ['total_branche'] }],
    raw: true,
    nest: true
  });
  const pendingCount = pendingPayments.length;
  const pendingTotalGnf = pendingPayments.reduce((sum, p) => sum + Number(p.cotisation_employeur?.total_branche || 0), 0);

  // 5. Demandes en cours
  const requestsPending = await Demande.count({ where: { employeurId, status: { [Op.notIn]: ['Terminé', 'Annulé', 'Refusé'] } } });

  // 6. Résumé du mois précédent (pour tendance)
  const declarationsPrevMonth = await CotisationEmployeur.count({
    where: { employeurId, createdAt: { [Op.gte]: startOfPrevMonth, [Op.lte]: endOfPrevMonth } }
  });
  const paymentsPrevMonth = await Paiement.count({
    where: { employeurId, is_paid: true, paid_date: { [Op.gte]: startOfPrevMonth, [Op.lte]: endOfPrevMonth } }
  });
  const paymentsThisMonth = await Paiement.count({
    where: { employeurId, is_paid: true, paid_date: { [Op.gte]: startOfMonth } }
  });
  const totalPayments = await Paiement.count({
    where: { employeurId, is_paid: true }
  });

  const declarationsTrend = totalDeclarations - declarationsPrevMonth;
  const paymentsTrend = paymentsThisMonth - paymentsPrevMonth;

  // 7. Activités récentes (10 dernières)
  const recentCotisations = await CotisationEmployeur.findAll({
    where: { employeurId },
    order: [['createdAt', 'DESC']],
    limit: 5,
    raw: true
  });
  const recentPaiements = await Paiement.findAll({
    where: { employeurId, is_paid: true },
    order: [['paid_date', 'DESC']],
    limit: 5,
    include: [{ model: CotisationEmployeur, as: 'cotisation_employeur', attributes: ['total_branche', 'periode'] }],
    raw: true,
    nest: true
  });
  const recentEmployes = await Employe.findAll({
    where: { employeurId },
    order: [['createdAt', 'DESC']],
    limit: 3,
    attributes: ['id', 'first_name', 'last_name', 'createdAt'],
    raw: true
  });

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const diff = Math.floor((now - d) / 1000);
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
    if (diff < 172800) return 'Hier';
    return d.toLocaleDateString('fr-FR');
  };

  const activities = [
    ...recentCotisations.map(c => ({
      id: `cot-${c.id}`,
      type: 'declaration',
      message: `Déclaration ${c.periode || ''} ${c.is_paid ? 'validée' : 'en attente'}`,
      time: formatTime(c.createdAt),
      status: c.is_paid ? 'success' : 'warning'
    })),
    ...recentPaiements.map(p => ({
      id: `pay-${p.id}`,
      type: 'payment',
      message: `Paiement de ${Number(p.cotisation_employeur?.total_branche || 0).toLocaleString('fr-FR')} GNF effectué`,
      time: formatTime(p.paid_date),
      status: 'success'
    })),
    ...recentEmployes.map(e => ({
      id: `emp-${e.id}`,
      type: 'employee',
      message: `Employé ${e.first_name || ''} ${e.last_name || ''} ajouté`,
      time: formatTime(e.createdAt),
      status: 'info'
    }))
  ].sort((a, b) => {
    const parseTime = (t) => {
      if (t.includes('min')) return parseInt(t) || 0;
      if (t.includes('h')) return parseInt(t) * 60 || 0;
      if (t === 'Hier') return 1440;
      return 99999;
    };
    return parseTime(a.time) - parseTime(b.time);
  }).slice(0, 10);

  return res.status(200).json({
    employeur: {
      companyName: employeur.raison_sociale || '',
      registrationNumber: employeur.no_immatriculation || ''
    },
    employees: {
      total: totalEmployees,
      addedThisMonth: employeesAddedThisMonth
    },
    cotisations: {
      totalGnf: totalGnfThisMonth,
      evolutionPercent,
      series
    },
    declarations: {
      total: totalDeclarations,
      validated: validatedDeclarations,
      validationRate
    },
    pendingPayments: {
      count: pendingCount,
      totalGnf: pendingTotalGnf
    },
    employeeSituation: {
      actifs,
      enAttente,
      retires,
      total: totalEmployees
    },
    recentActivities: activities,
    monthSummary: {
      month: monthKey,
      monthLabel,
      declarationsCount: totalDeclarations,
      paymentsCount: paymentsThisMonth,
      paymentsTotal: totalPayments,
      requestsPending,
      declarationsTrend: declarationsTrend >= 0 ? `+${declarationsTrend}` : `${declarationsTrend}`,
      paymentsTrend: paymentsTrend >= 0 ? `+${paymentsTrend}` : `${paymentsTrend}`,
      requestsTrend: '0'
    },
    unreadActivitiesCount: activities.filter(a => a.time.includes('min') || a.time.includes('h')).length
  });
}));

/**
 * GET /api/v1/employeur/dashboard/stats
 * KPIs agrégés : employés, cotisations, déclarations, paiements en attente.
 */
router.get('/dashboard/stats', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const employeurId = req.user.user_id;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalEmployees = await Employe.count({ where: { employeurId } });
  const employeesAddedThisMonth = await Employe.count({ where: { employeurId, createdAt: { [Op.gte]: startOfMonth } } });
  const totalCotisationsGnf = await CotisationEmployeur.sum('total_branche', { where: { employeurId, createdAt: { [Op.gte]: startOfMonth } } }) || 0;
  const totalDeclarations = await CotisationEmployeur.count({ where: { employeurId, createdAt: { [Op.gte]: startOfMonth } } });
  const pendingPaymentsCount = await Paiement.count({ where: { employeurId, is_paid: false } });

  return res.status(200).json({
    totalEmployees,
    employeesAddedThisMonth,
    totalCotisationsGnf,
    totalDeclarations,
    pendingPaymentsCount
  });
}));

/**
 * GET /api/v1/employeur/dashboard/employee-situation
 * Actifs, en attente, retraités, total.
 */
router.get('/dashboard/employee-situation', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const employeurId = req.user.user_id;

  const actifs = await Employe.count({ where: { employeurId, is_out: false, is_imma: true } });
  const enAttente = await Employe.count({ where: { employeurId, is_imma: false } });
  const retires = await Employe.count({ where: { employeurId, is_out: true } });
  const total = await Employe.count({ where: { employeurId } });

  return res.status(200).json({ actifs, enAttente, retires, total });
}));

/**
 * GET /api/v1/employeur/dashboard/pending-payments
 * Nombre et montant des paiements en attente.
 */
router.get('/dashboard/pending-payments', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const employeurId = req.user.user_id;

  const pendingPayments = await Paiement.findAll({
    where: { employeurId, is_paid: false },
    include: [{ model: CotisationEmployeur, as: 'cotisation_employeur', attributes: ['total_branche'] }],
    raw: true,
    nest: true
  });

  const count = pendingPayments.length;
  const totalGnf = pendingPayments.reduce((sum, p) => sum + Number(p.cotisation_employeur?.total_branche || 0), 0);

  return res.status(200).json({ count, totalGnf });
}));

/**
 * GET /api/v1/employeur/dashboard/recent-activities
 * Liste d'activités récentes.
 * Query: limit (default 10)
 */
router.get('/dashboard/recent-activities', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const employeurId = req.user.user_id;
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  const now = new Date();

  const recentCotisations = await CotisationEmployeur.findAll({
    where: { employeurId },
    order: [['createdAt', 'DESC']],
    limit,
    raw: true
  });
  const recentPaiements = await Paiement.findAll({
    where: { employeurId, is_paid: true },
    order: [['paid_date', 'DESC']],
    limit,
    include: [{ model: CotisationEmployeur, as: 'cotisation_employeur', attributes: ['total_branche', 'periode'] }],
    raw: true,
    nest: true
  });
  const recentEmployes = await Employe.findAll({
    where: { employeurId },
    order: [['createdAt', 'DESC']],
    limit: Math.ceil(limit / 2),
    attributes: ['id', 'first_name', 'last_name', 'createdAt'],
    raw: true
  });

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const diff = Math.floor((now - d) / 1000);
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
    if (diff < 172800) return 'Hier';
    return d.toLocaleDateString('fr-FR');
  };

  const activities = [
    ...recentCotisations.map(c => ({
      id: `cot-${c.id}`,
      type: 'declaration',
      message: `Déclaration ${c.periode || ''} ${c.is_paid ? 'validée' : 'en attente'}`,
      time: formatTime(c.createdAt),
      status: c.is_paid ? 'success' : 'warning'
    })),
    ...recentPaiements.map(p => ({
      id: `pay-${p.id}`,
      type: 'payment',
      message: `Paiement de ${Number(p.cotisation_employeur?.total_branche || 0).toLocaleString('fr-FR')} GNF effectué`,
      time: formatTime(p.paid_date),
      status: 'success'
    })),
    ...recentEmployes.map(e => ({
      id: `emp-${e.id}`,
      type: 'employee',
      message: `Employé ${e.first_name || ''} ${e.last_name || ''} ajouté`,
      time: formatTime(e.createdAt),
      status: 'info'
    }))
  ].slice(0, limit);

  return res.status(200).json({ activities, unreadCount: activities.filter(a => a.time.includes('min')).length });
}));

// GET /stats — Statistiques globales des employeurs (portail BO)
router.get('/stats', asyncHandler(async (req, res) => {
  const [
    total,
    traite,
    actifs,
    inactifs,
    totalEffectifRaw,
    totalSoldeRaw,
  ] = await Promise.all([
    Employeur.count(),
    Employeur.count({ where: { is_immatriculed: true } }),
    Employeur.count({ where: { is_active: true } }),
    Employeur.count({ where: { is_active: false } }),
    Employeur.sum('effectif_total'),
    Employeur.sum('solde'),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      total,
      traite,
      non_traite: total - traite,
      actifs,
      inactifs,
      totalEffectif: totalEffectifRaw || 0,
      totalSolde: totalSoldeRaw || 0,
      byCategory: [],
      byPrefecture: [],
      byFormeJuridique: [],
    },
  });
}));

// ============================================
// ROUTES BO CNSS (REST)
// POST /:id/validate  — immatriculer l'employeur
// POST /:id/reject    — rejeter l'affiliation
// PUT  /:id/toggle-active — activer/désactiver
// ============================================

router.post('/:id/validate', utility.verifyToken, asyncHandler(async (req, res) => {
  const employeurId = parseInt(req.params.id);
  if (isNaN(employeurId)) return res.status(400).json({ success: false, error: 'ID invalide' });

  const employeur = await Employeur.findByPk(employeurId, {
    include: [{ association: 'prefecture' }, { association: 'branche' }],
  });
  if (!employeur) return res.status(404).json({ success: false, error: 'Employeur non trouvé' });
  if (employeur.is_immatriculed) return res.status(400).json({ success: false, error: 'Cet employeur est déjà immatriculé' });

  await employeur.update({
    is_immatriculed: true,
    who_valide: req.user.id,
    date_immatriculation: new Date(),
  });

  await addJob({ type: 'employeur', employeurId, user_valid: req.user.id });

  const updated = await Employeur.findByPk(employeurId, {
    include: [{ association: 'prefecture' }, { association: 'branche' }],
  });
  return res.status(200).json({ success: true, data: updated, message: 'Employeur immatriculé avec succès' });
}));

router.post('/:id/reject', utility.verifyToken, asyncHandler(async (req, res) => {
  const employeurId = parseInt(req.params.id);
  if (isNaN(employeurId)) return res.status(400).json({ success: false, error: 'ID invalide' });

  const employeur = await Employeur.findByPk(employeurId);
  if (!employeur) return res.status(404).json({ success: false, error: 'Employeur non trouvé' });

  const { reason, details } = req.body;
  if (!reason) return res.status(400).json({ success: false, error: 'Motif de rejet requis' });

  // Marque comme non immatriculé + désactive
  await employeur.update({ is_immatriculed: false, is_active: false });

  return res.status(200).json({ success: true, message: 'Affiliation rejetée', reason, details });
}));

router.put('/:id/toggle-active', utility.verifyToken, asyncHandler(async (req, res) => {
  const employeurId = parseInt(req.params.id);
  if (isNaN(employeurId)) return res.status(400).json({ success: false, error: 'ID invalide' });

  const employeur = await Employeur.findByPk(employeurId);
  if (!employeur) return res.status(404).json({ success: false, error: 'Employeur non trouvé' });

  const { is_active } = req.body;
  await employeur.update({ is_active: Boolean(is_active) });

  return res.status(200).json({ success: true, data: { ...employeur.toJSON(), is_active: Boolean(is_active) } });
}));

// POST / — créer un employeur directement depuis le BO (multipart)
router.post(
  '/',
  utility.upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'rccm_file', maxCount: 1 },
    { name: 'dni_file', maxCount: 1 },
    { name: 'DPAE_file', maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const { raison_sociale } = req.body;
    if (!raison_sociale || !String(raison_sociale).trim()) {
      return res.status(400).json({ success: false, error: 'La raison sociale est obligatoire' });
    }

    const files = req.files || {};
    const fileFields = {};
    if (files.logo?.[0])      fileFields.logo      = `/uploads/${files.logo[0].filename}`;
    if (files.rccm_file?.[0]) fileFields.rccm_file = `/uploads/${files.rccm_file[0].filename}`;
    if (files.dni_file?.[0])  fileFields.dni_file  = `/uploads/${files.dni_file[0].filename}`;
    if (files.DPAE_file?.[0]) fileFields.DPAE_file = `/uploads/${files.DPAE_file[0].filename}`;

    const employeur = await Employeur.create({
      ...req.body,
      ...fileFields,
      is_immatriculed: false,
      is_active: true,
      role: 'employeur',
    });

    const result = await Employeur.findByPk(employeur.id, {
      include: [{ association: 'prefecture' }, { association: 'branche' }],
    });

    return res.status(201).json({ success: true, data: result });
  })
);

// GET export PDF du relevé de compte employeur
router.get('/:id/compte/pdf', asyncHandler(async (req, res) => {
  const employeurId = parseInt(req.params.id);
  if (isNaN(employeurId)) return res.status(400).json({ error: 'ID invalide' });

  const year = req.query.year ? parseInt(req.query.year) : null;
  const where = { employeurId };
  if (year) where.year = year;

  const [employeur, cotisations] = await Promise.all([
    Employeur.findByPk(employeurId, {
      attributes: ['raison_sociale', 'no_immatriculation', 'no_compte', 'adresse'],
    }),
    CotisationEmployeur.findAll({
      where,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'motif', 'periode', 'year', 'createdAt', 'current_effectif', 'total_cotisation', 'is_paid', 'paid_date'],
    }),
  ]);

  if (!employeur) return res.status(404).json({ error: 'Employeur non trouvé' });

  const sumTotal = cotisations.reduce((s, c) => s + (Number(c.total_cotisation) || 0), 0);
  const sumPaid  = cotisations.filter(c => c.is_paid).reduce((s, c) => s + (Number(c.total_cotisation) || 0), 0);

  const data = cotisations.map(c => ({
    motif: c.motif,
    periode: c.periode,
    date: c.createdAt,
    current_effectif: c.current_effectif,
    total_cotisation: Number(c.total_cotisation) || 0,
    is_paid: c.is_paid,
    paid_date: c.paid_date,
  }));

  const buffer = await genereComptePdf(data, employeur.toJSON(), {
    totalDebit: sumTotal,
    totalCredit: sumPaid,
    solde: sumTotal - sumPaid,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="compte_${employeurId}.pdf"`);
  res.send(buffer);
}));

// GET employés déclarés pour une cotisation donnée
router.get('/:id/compte/:cotisationId/employes', asyncHandler(async (req, res) => {
  const employeurId   = parseInt(req.params.id);
  const cotisationId  = parseInt(req.params.cotisationId);

  if (isNaN(employeurId) || isNaN(cotisationId)) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }

  const declarations = await Demploye.findAll({
    where: { cotisation_employeurId: cotisationId, employeurId },
    include: [{
      model: Employe,
      as: 'employe',
      attributes: ['id', 'first_name', 'last_name', 'matricule', 'gender', 'phone_number', 'email'],
    }],
    order: [['id', 'ASC']],
  });

  const employes = declarations.map(d => ({
    id: d.employe?.id,
    nom: `${d.employe?.first_name || ''} ${d.employe?.last_name || ''}`.trim(),
    matricule: d.employe?.matricule || '-',
    gender: d.employe?.gender || '-',
    phone_number: d.employe?.phone_number || '-',
    email: d.employe?.email || '-',
    salary_brut: Number(d.salary_brut) || 0,
    salary_soumis_cotisation: Number(d.salary_soumis_cotisation) || 0,
    cotisation_employe: Number(d.cotisation_employe) || 0,
    cotisation_emplyeur: Number(d.cotisation_emplyeur) || 0,
    total_cotisation: Number(d.total_cotisation) || 0,
  }));

  return res.status(200).json({ success: true, data: { employes, total: employes.length } });
}));

// GET export PDF des employés d'une cotisation
router.get('/:id/compte/:cotisationId/employes/pdf', asyncHandler(async (req, res) => {
  const employeurId  = parseInt(req.params.id);
  const cotisationId = parseInt(req.params.cotisationId);
  if (isNaN(employeurId) || isNaN(cotisationId)) return res.status(400).json({ error: 'ID invalide' });

  const [employeur, declarations] = await Promise.all([
    Employeur.findByPk(employeurId, { attributes: ['raison_sociale', 'no_immatriculation', 'adresse'] }),
    Demploye.findAll({
      where: { cotisation_employeurId: cotisationId, employeurId },
      include: [{ model: Employe, as: 'employe', attributes: ['first_name', 'last_name', 'matricule', 'no_immatriculation'] }],
    }),
  ]);

  const cotisation = await CotisationEmployeur.findByPk(cotisationId, { attributes: ['periode', 'year'] });

  const data = declarations.map(d => ({
    no_immatriculation: d.employe?.no_immatriculation ?? d.employe?.matricule ?? '',
    first_name: d.employe?.first_name ?? '',
    last_name: d.employe?.last_name ?? '',
    salary_brut: Number(d.salary_brut) || 0,
    ssc: Number(d.salary_soumis_cotisation) || 0,
    cotisation_employe: Number(d.cotisation_employe) || 0,
    cotisation_emplyeur: Number(d.cotisation_emplyeur) || 0,
  }));

  const buffer = await generelistDeclaration(data, employeur, cotisation?.periode, cotisation?.year);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="declaration_${cotisationId}.pdf"`);
  res.send(buffer);
}));

// GET export Excel des employés d'une cotisation
router.get('/:id/compte/:cotisationId/employes/excel', asyncHandler(async (req, res) => {
  const employeurId  = parseInt(req.params.id);
  const cotisationId = parseInt(req.params.cotisationId);
  if (isNaN(employeurId) || isNaN(cotisationId)) return res.status(400).json({ error: 'ID invalide' });

  const [declarations, cotisation] = await Promise.all([
    Demploye.findAll({
      where: { cotisation_employeurId: cotisationId, employeurId },
      include: [{ model: Employe, as: 'employe', attributes: ['first_name', 'last_name', 'matricule', 'no_immatriculation'] }],
    }),
    CotisationEmployeur.findByPk(cotisationId, { attributes: ['periode', 'year'] }),
  ]);

  const data = declarations.map(d => ({
    matricule: d.employe?.matricule ?? '',
    no_immatriculation: d.employe?.no_immatriculation ?? '',
    first_name: d.employe?.first_name ?? '',
    last_name: d.employe?.last_name ?? '',
    salary_brut: Number(d.salary_brut) || 0,
    ssc: Number(d.salary_soumis_cotisation) || 0,
    cotisation_emplyeur: Number(d.cotisation_emplyeur) || 0,
    cotisation_employe: Number(d.cotisation_employe) || 0,
  }));

  const buffer = await exportDeclaration(data, cotisation?.periode ?? '', cotisation?.year ?? '');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="declaration_${cotisationId}.xlsx"`);
  res.send(buffer);
}));

// GET compte employeur — cotisations (payées et non payées), paginées
router.get('/:id/compte', asyncHandler(async (req, res) => {
  const employeurId = parseInt(req.params.id);
  if (isNaN(employeurId)) return res.status(400).json({ success: false, error: 'ID invalide' });

  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 15);
  const offset = (page - 1) * limit;
  const year  = req.query.year ? parseInt(req.query.year) : null;

  const employeur = await Employeur.findByPk(employeurId, {
    attributes: ['id', 'raison_sociale', 'no_immatriculation', 'no_compte', 'category', 'adresse', 'email', 'phone_number', 'solde', 'effectif_total'],
  });
  if (!employeur) return res.status(404).json({ success: false, error: 'Employeur non trouvé' });

  const where = { employeurId };
  if (year) where.year = year;

  const { count, rows: cotisations } = await CotisationEmployeur.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  // Transformer chaque cotisation en ligne de compte (débit = facture, crédit = paiement)
  const transactions = cotisations.map(c => ({
    id: c.id,
    type: 'facturation',
    libelle: c.motif || `Cotisation ${c.periode || c.year || ''}`,
    periode: c.periode || (c.year ? String(c.year) : null),
    date: c.createdAt,
    debit: Number(c.total_cotisation) || 0,
    credit: c.is_paid ? Number(c.total_cotisation) || 0 : 0,
    is_paid: c.is_paid,
    paid_date: c.paid_date,
    quittance: c.quittance,
    total_salary: c.total_salary,
    total_cotisation_employe: c.total_cotisation_employe,
    total_cotisation_employeur: c.total_cotisation_employeur,
    total_cotisation: c.total_cotisation,
    prestation_familiale: c.prestation_familiale,
    risque_professionnel: c.risque_professionnel,
    assurance_maladie: c.assurance_maladie,
    vieillesse: c.vieillesse,
    penelite_amount: c.penelite_amount,
    is_penalite_applied: c.is_penalite_applied,
    current_effectif: c.current_effectif,
  }));

  // Totaux globaux (toutes pages confondues)
  const [sumTotal, sumPaid, countPaid, countUnpaid, nbEmployes] = await Promise.all([
    CotisationEmployeur.sum('total_cotisation', { where }),
    CotisationEmployeur.sum('total_cotisation', { where: { ...where, is_paid: true } }),
    CotisationEmployeur.count({ where: { ...where, is_paid: true } }),
    CotisationEmployeur.count({ where: { ...where, is_paid: false } }),
    Employe.count({ where: { employeurId } }),
  ]);

  const totalDebit  = Number(sumTotal)  || 0;
  const totalCredit = Number(sumPaid)   || 0;
  const soldeCalcule = totalDebit - totalCredit;

  const emp = employeur.toJSON();

  return res.status(200).json({
    success: true,
    data: {
      employeur: {
        ...emp,
        solde:          soldeCalcule,
        effectif_total: nbEmployes,
      },
      transactions,
      totaux: {
        totalDebit,
        totalCredit,
        solde: soldeCalcule,
      },
      stats: {
        nbTransactions: count,
        nbFacturations: count,
        nbPaiements: countPaid,
        cotisationsEnAttente: countUnpaid,
        totalPenalites: 0,
      },
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    },
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const employeurId = parseInt(id);

  if (isNaN(employeurId)) {
    return res.status(400).json({ success: false, error: 'ID invalide' });
  }

  const employeur = await Employeur.findByPk(employeurId, {
    include: [
      { association: 'request_employeur' },
      { association: 'prefecture' },
      { association: 'branche' },
    ]
  });

  if (!employeur) {
    return res.status(404).json({ success: false, error: 'Employeur non trouvé' });
  }

  return res.status(200).json({ success: true, data: employeur });
}));

// PUT update employeur
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const employeurId = parseInt(id);

  if (isNaN(employeurId)) {
    return res.status(400).json({ error: 'ID invalide' });
  }

  const employeur = await Employeur.findByPk(employeurId);
  if (!employeur) {
    return res.status(404).json({ error: 'Employeur not found' });
  }

  await employeur.update(req.body);

  const updatedEmployeur = await Employeur.findByPk(employeurId, {
    include: [
      { association: 'request_employeur' },
      { association: 'prefecture' },
      { association: 'branche' }
    ]
  });

  return res.status(200).json(updatedEmployeur);
}));

// DELETE employeur
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const employeurId = parseInt(id);

  if (isNaN(employeurId)) {
    return res.status(400).json({ error: 'ID invalide' });
  }

  const employeur = await Employeur.findByPk(employeurId);
  if (!employeur) {
    return res.status(404).json({ error: 'Employeur not found' });
  }

  await employeur.destroy();

  return res.status(200).json({ message: 'Employeur deleted successfully' });
}));

// Error handling middleware (catches errors from asyncHandler)
router.use((error, req, res, next) => {
  console.error('Route error:', error);
  
  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({
      message: 'Erreurs de validation',
      errors: error.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      message: 'Une donnée unique existe déjà',
      field: error.errors[0]?.path || 'unknown'
    });
  }

  return res.status(500).json({
    message: 'Erreur interne du serveur',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = router;
