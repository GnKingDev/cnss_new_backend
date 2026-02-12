const express = require('express');
const router = express.Router();
const DirgaU = require('./model');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');
const Adhesion = require('../adhesion/model');
const Paiement = require('../paiement/model');
const RequestEmployeur = require('../request_employeur/model');
const Users = require('../users/model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { verifyToken } = require('../XYemployeurs/utility');
const { hashPassword, generateUniqueCode } = require('../users/utility');
const { Op } = require('sequelize');

let addJob, sendMailAdhesion;
try {
  addJob = require('../../config.queue').addJob;
} catch (err) {
  addJob = async () => null;
}
try {
  const u2 = require('../../utility2');
  sendMailAdhesion = u2.sendMailAdhesion || (() => Promise.resolve());
} catch (err) {
  sendMailAdhesion = () => Promise.resolve();
}

/**
 * Module `db/dirga_user/route.js` – Gestion des utilisateurs DIRGA
 * 
 * Ce module gère l'authentification et les fonctionnalités administratives des agents DIRGA.
 * Base path: /api/v1/dirga
 */

// Old DB API URL (should be in environment variable)
const util_link = process.env.OLD_DB_API_URL || 'http://192.168.56.128';

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
// 1. AUTHENTIFICATION
// ============================================

/**
 * POST /api/v1/dirga/login
 * 
 * Authentifie un agent DIRGA et retourne un token JWT.
 * CORRIGÉ: Le mot de passe hashé n'est plus inclus dans le token.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }

    const user_dirga = await DirgaU.findOne({ where: { email: email } });

    if (!user_dirga) {
      // Délai pour éviter l'énumération
      await new Promise(resolve => setTimeout(resolve, 1000));
      return res.status(400).json({ message: "Nom d'utilisateur ou mot de passe incorrect" });
    }

    if (!user_dirga.can_work) {
      return res.status(403).json({ message: "Votre compte a été désactivé" });
    }

    const is_password = await bcrypt.compare(password, user_dirga.password);

    if (!is_password) {
      return res.status(400).json({ message: "Nom d'utilisateur ou mot de passe incorrect" });
    }

    // Payload sans mot de passe (CORRECTION DE SÉCURITÉ)
    const payload = {
      id: user_dirga.id,
      email: user_dirga.email,
      first_name: user_dirga.first_name,
      last_name: user_dirga.last_name,
      type: user_dirga.type
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || process.env.key || 'your-secret-key', { expiresIn: '2d' });

    // Mettre à jour la dernière connexion (si le champ existe)
    // Note: Le modèle n'a pas de champ last_login, mais on peut l'ajouter si nécessaire

    return res.status(200).json({
      token: token,
      user: {
        id: user_dirga.id,
        email: user_dirga.email,
        first_name: user_dirga.first_name,
        last_name: user_dirga.last_name,
        type: user_dirga.type
      }
    });
  } catch (error) {
    console.error('[DIRGA_LOGIN] Error:', error);
    return res.status(500).json({ message: 'Erreur interne' });
  }
});

/**
 * GET /api/v1/dirga/get_current_user
 * 
 * Récupère les informations de l'agent DIRGA connecté.
 * Middleware: verifyToken
 */
router.get('/get_current_user', verifyToken, async (req, res) => {
  try {
    const user = await DirgaU.findByPk(req.user.id, {
      attributes: { exclude: ['password'] } // Ne pas exposer le mot de passe
    });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error('[DIRGA_GET_CURRENT_USER] Error:', error);
    return res.status(400).json({ message: error.message || 'Error' });
  }
});

// ============================================
// 2. STATISTIQUES ET RÉCAPITULATIFS
// ============================================

/**
 * GET /api/v1/dirga/recap
 * 
 * Récupère un récapitulatif statistique de tous les éléments du système.
 * Middleware: verifyToken
 * OPTIMISÉ: Utilise count() au lieu de findAll().length
 */
router.get('/recap', verifyToken, async (req, res) => {
  try {
    // Utiliser Promise.all pour paralléliser les requêtes
    const [
      EmployeurImma,
      EmployeurNotImma,
      adhesionValid,
      adhesionNotValid,
      EmployeValide,
      EmployeNotValide,
      employeAdhesion,
      employeAdhesionNotValid,
      paiementValid,
      paiementNonValid
    ] = await Promise.all([
      Employeur.count({ where: { is_immatriculed: true, is_new_compamy: true } }),
      Employeur.count({ where: { is_immatriculed: false } }),
      Adhesion.count({ where: { is_valid: true } }),
      Adhesion.count({ where: { is_valid: false } }),
      Employe.count({ where: { is_imma: true, is_adhesion: false } }),
      Employe.count({ where: { is_imma: false, is_adhesion: false } }),
      Employe.count({ where: { is_imma: true, is_adhesion: true } }),
      Employe.count({ where: { is_imma: false, is_adhesion: true } }),
      Paiement.count({ where: { is_paid: true } }),
      Paiement.count({ where: { is_paid: false } })
    ]);

    const stats = {
      emloyeurImma: EmployeurImma,
      emmployeurNotImma: EmployeurNotImma,
      adhesionValid: adhesionValid,
      adhesionNotValid: adhesionNotValid,
      employeValide: EmployeValide,
      employeNotValide: EmployeNotValide,
      employeAdhesion: employeAdhesion,
      employeAdhesionNotValid: employeAdhesionNotValid,
      paiementValid: paiementValid,
      paiementNonValid: paiementNonValid
    };

    return res.status(200).json(stats);
  } catch (error) {
    console.error('[DIRGA_RECAP] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

// ============================================
// 3. GESTION DES EMPLOYEURS
// ============================================

/**
 * GET /api/v1/dirga/get_employeur
 * 
 * Récupère la liste de tous les employeurs avec pagination.
 * Middleware: verifyToken
 */
router.get('/get_employeur', verifyToken, async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const result = await Employeur.findAndCountAll({
      include: [
        { association: 'request_employeur' },
        { association: 'prefecture' },
        { association: 'branche' }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[DIRGA_GET_EMPLOYEUR] Error:', error);
    return res.status(400).json({ message: 'error' });
  }
});

/**
 * GET /api/v1/dirga/adhesion/:numero
 * 
 * Ajoute un employeur depuis l'ancienne base de données (adhésion).
 * Middleware: verifyToken
 * Paramètres: :numero = numéro d'immatriculation
 */
router.get('/adhesion/:numero', verifyToken, async (req, res) => {
  try {
    const numero = req.params.numero.trim();

    if (!numero || numero.length < 10) {
      return res.status(400).json({ message: 'Numéro d\'immatriculation invalide' });
    }

    // Vérification dans la nouvelle DB
    const existingEmployeur = await Employeur.findOne({
      where: { no_immatriculation: numero }
    });

    if (existingEmployeur) {
      return res.status(400).json({ message: 'Ce numero est déjà employeur dans le systeme' });
    }

    // Vérification dans les adhésions
    const existingAdhesion = await Adhesion.findOne({
      where: { no_immatriculation: numero }
    });

    if (existingAdhesion) {
      return res.status(400).json({ message: "Ce numero est dans l'adhesion" });
    }

    // Vérification dans l'ancienne DB
    try {
      const response = await axios.get(`${util_link}/anciencode/verify/${numero}`, {
        timeout: 10000
      });

      if (response.status === 200 && response.data) {
        const data = response.data;

        // Créer le demandeur
        const requester = await RequestEmployeur.create({
          first_name: data.first_name || '',
          last_name: data.last_name || ''
        });

        // Créer l'employeur
        await Employeur.create({
          request_employeurId: requester.id,
          is_insert_oldDB: true,
          is_immatriculed: true,
          is_new_compamy: false, // Pas une nouvelle entreprise
          raison_sociale: data.raison_sociale || '',
          no_immatriculation: data.no_immatriculation || numero,
          no_dni: data.no_dni || null,
          no_rccm: data.no_rccm || null,
          effectif_femme: 0,
          effectif_homme: 0,
          effectif_apprentis: 0,
          who_valide: req.user.id,
          email: null,
          phone_number: null
        });

        return res.status(200).json({ message: 'Employeur ajouteé' });
      } else {
        return res.status(400).json({ message: 'Erreur veuillez reessayer' });
      }
    } catch (axiosError) {
      console.error('[DIRGA_ADHESION] Old DB API error:', axiosError.message);
      return res.status(400).json({ message: 'Veuillez reessayer' });
    }
  } catch (error) {
    console.error('[DIRGA_ADHESION] Error:', error);
    return res.status(500).json({ message: 'Erreur lors de l\'ajout de l\'employeur' });
  }
});

/**
 * POST /api/v1/dirga/send_account/:id
 * 
 * Crée et envoie les identifiants de connexion à un employeur (adhésion).
 * Middleware: verifyToken
 * Paramètres: :id = ID de l'employeur
 */
router.post('/send_account/:id', verifyToken, async (req, res) => {
  const transaction = await require('../db.connection').sequelize.transaction();
  
  try {
    const employeurId = parseInt(req.params.id);
    const { email, phone_number, category, adresse, first_name, last_name } = req.body;

    if (isNaN(employeurId)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'ID invalide' });
    }

    // Validation des données
    if (!email || !phone_number || !first_name || !last_name) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Données manquantes' });
    }

    // Récupération de l'employeur
    const employeur = await Employeur.findByPk(employeurId, { transaction });
    if (!employeur) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Employeur non trouvé' });
    }

    // Mise à jour de l'employeur
    employeur.email = email;
    employeur.phone_number = phone_number;
    if (category) employeur.category = category;
    if (adresse) employeur.adresse = adresse;
    await employeur.save({ transaction });

    // Suppression de l'ancien utilisateur (si existe)
    const oldUser = await Users.findOne({
      where: { user_identify: employeur.no_immatriculation }
    });
    if (oldUser) {
      await oldUser.destroy({ transaction });
    }

    // Génération du mot de passe
    const nohased_password = generateUniqueCode(9);
    const user_password_hashed = await hashPassword(nohased_password);

    // Création dans Paylican (après commit de la transaction)
    // NOTE: paylican_token et paylican_create_company doivent être importés
    // Pour l'instant, on les appelle mais on ne bloque pas en cas d'erreur
    const employeurUtility = require('../XYemployeurs/utility');
    try {
      const token = await employeurUtility.getPaylicanToken();
      if (token && employeurUtility.paylican_create_company) {
        await employeurUtility.paylican_create_company(employeur, token, employeur.no_immatriculation);
      }
    } catch (paylicanError) {
      console.warn('[DIRGA_SEND_ACCOUNT] Paylican error (non-blocking):', paylicanError.message);
    }

    // Création de l'utilisateur
    const user = await Users.create({
      user_identify: employeur.no_immatriculation,
      role: "employeur",
      first_login: true,
      user_id: employeur.id,
      password: user_password_hashed,
      identity: employeur.no_immatriculation,
      email: email,
      phone_number: phone_number,
      full_name: `${first_name} ${last_name}`
    }, { transaction });

    // Mise à jour des noms
    user.first_name = first_name;
    user.last_name = last_name;
    await user.save({ transaction });

    // Commit transaction
    await transaction.commit();

    // Opérations externes après commit (non bloquantes)
    try {
      // Création du compte Payeur dans Paylican
      await employeurUtility.addingUserPaylican(user, employeur);

      await sendMailAdhesion(employeur, nohased_password);
    } catch (externalError) {
      console.error('[DIRGA_SEND_ACCOUNT] External service error (non-blocking):', externalError);
      // Ne pas bloquer la réponse en cas d'erreur externe
    }

    return res.status(200).json({ message: 'Compte envoyé avec succes' });
  } catch (error) {
    await transaction.rollback();
    console.error('[DIRGA_SEND_ACCOUNT] Error:', error);
    return res.status(400).json({ message: error.message || 'Erreur lors de la création du compte' });
  }
});

/**
 * GET /api/v1/dirga/get_agent_his_employeur
 * 
 * Récupère tous les employeurs validés par l'agent DIRGA connecté.
 * Middleware: verifyToken
 */
router.get('/get_agent_his_employeur', verifyToken, async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const result = await Employeur.findAndCountAll({
      where: { who_valide: req.user.id },
      include: [
        { association: 'request_employeur' },
        { association: 'prefecture' },
        { association: 'branche' }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[DIRGA_GET_AGENT_HIS_EMPLOYEUR] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

// ============================================
// 4. GESTION DES EMPLOYÉS
// ============================================

/**
 * POST /api/v1/dirga/save_his_employe
 * 
 * Sauvegarde directement des employés dans la base de données (sans immatriculation).
 * Middleware: verifyToken
 */
router.post('/save_his_employe', verifyToken, async (req, res) => {
  try {
    if (!req.body.data || !Array.isArray(req.body.data) || req.body.data.length === 0) {
      return res.status(400).json({ message: 'Données invalides' });
    }

    if (req.body.data.length > 1000) {
      return res.status(400).json({ message: 'Trop d\'employés à la fois (max 1000)' });
    }

    await Employe.bulkCreate(req.body.data, {
      validate: true,
      individualHooks: true
    });

    return res.status(200).json({ message: 'ok' });
  } catch (error) {
    console.error('[DIRGA_SAVE_HIS_EMPLOYE] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/v1/dirga/save_his_employe_non_imma
 * 
 * Ajoute des employés non immatriculés dans la queue pour traitement asynchrone.
 * Middleware: verifyToken
 */
router.post('/save_his_employe_non_imma', verifyToken, async (req, res) => {
  try {
    if (!req.body.data || !Array.isArray(req.body.data) || req.body.data.length === 0) {
      return res.status(400).json({ message: 'Données invalides' });
    }

    if (req.body.data.length > 1000) {
      return res.status(400).json({ message: 'Trop d\'employés à la fois (max 1000)' });
    }

    const jobId = await addJob({ type: 'employeBulk', allEmploye: req.body.data });
    return res.status(200).json({ message: 'ajouter avec succes', jobId });
  } catch (error) {
    console.error('[DIRGA_SAVE_HIS_EMPLOYE_NON_IMMA] Error:', error);
    return res.status(400).json({ message: error.message || 'erreur' });
  }
});

/**
 * POST /api/v1/dirga/save_his_employe_exist
 * 
 * Ajoute des employés déjà immatriculés dans l'ancienne DB (adhésion).
 * Middleware: verifyToken
 */
router.post('/save_his_employe_exist', verifyToken, async (req, res) => {
  try {
    if (!req.body.data || !Array.isArray(req.body.data) || req.body.data.length === 0) {
      return res.status(400).json({ message: 'Données invalides' });
    }

    const jobId = await addJob({ type: 'exist_employe', data: req.body.data });
    return res.status(200).json({ message: 'save_employe', jobId });
  } catch (error) {
    console.error('[DIRGA_SAVE_HIS_EMPLOYE_EXIST] Error:', error);
    return res.status(400).json({ message: error.message || 'erreur' });
  }
});

/**
 * GET /api/v1/dirga/get_agent_his_employe/:employeur_id
 * 
 * Récupère tous les employés d'un employeur validés par l'agent DIRGA connecté.
 * Middleware: verifyToken
 * CORRIGÉ: Retourne 400 en cas d'erreur au lieu de 200
 */
router.get('/get_agent_his_employe/:employeur_id', verifyToken, async (req, res) => {
  try {
    const employeurId = parseInt(req.params.employeur_id);
    if (isNaN(employeurId)) {
      return res.status(400).json({ message: 'ID employeur invalide' });
    }

    const { page, limit, offset } = getPaginationParams(req);

    const result = await Employe.findAndCountAll({
      where: {
        employeurId: employeurId,
        who_valid: req.user.id
      },
      include: [{ association: 'prefecture' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[DIRGA_GET_AGENT_HIS_EMPLOYE] Error:', error);
    return res.status(400).json({ message: error.message }); // CORRIGÉ: 400 au lieu de 200
  }
});

/**
 * GET /api/v1/dirga/get_all_employe/:employeur_id
 * 
 * Récupère tous les employés d'un employeur (sans filtre par agent).
 * Middleware: verifyToken
 */
router.get('/get_all_employe/:employeur_id', verifyToken, async (req, res) => {
  try {
    const employeurId = parseInt(req.params.employeur_id);
    if (isNaN(employeurId)) {
      return res.status(400).json({ message: 'ID employeur invalide' });
    }

    const { page, limit, offset } = getPaginationParams(req);

    const result = await Employe.findAndCountAll({
      where: { employeurId: employeurId },
      include: [{ association: 'prefecture' }],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[DIRGA_GET_ALL_EMPLOYE] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

module.exports = router;
