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
 * Module `db/admin/route.js` – Gestion des utilisateurs admin (portail BO)
 *
 * Authentification et fonctionnalités des agents admin / DIRGA.
 * Base path: /api/v1/admin
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

// Permissions par défaut par rôle (aligné avec le BO)
const DEFAULT_ROLE_PERMISSIONS = {
  admin: ['all'],
  directeur: ['view_all', 'approve', 'reject', 'assign', 'process', 'reports', 'manage_users', 'export'],
  chef_service: ['view_service', 'approve', 'reject', 'assign', 'process', 'export'],
  agent: ['view_assigned', 'process']
};

function getEffectivePermissions(user) {
  const perms = user.permissions;
  if (Array.isArray(perms) && perms.length > 0) return perms;
  const role = (user.type || 'agent').toLowerCase();
  return DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.agent;
}

function toBoUser(user_dirga) {
  const permissions = getEffectivePermissions(user_dirga);
  return {
    id: String(user_dirga.id),
    matricule: user_dirga.matricule || user_dirga.email,
    nom: user_dirga.last_name || '',
    prenom: user_dirga.first_name || '',
    email: user_dirga.email,
    telephone: user_dirga.telephone || '',
    role: user_dirga.type || 'agent',
    service: user_dirga.service || '',
    status: user_dirga.can_work ? 'active' : 'inactive',
    permissions,
    dateCreation: user_dirga.createdAt ? user_dirga.createdAt.toISOString().split('T')[0] : '',
    derniereConnexion: user_dirga.last_login ? user_dirga.last_login.toISOString() : null
  };
}

// ============================================
// 1. AUTHENTIFICATION
// ============================================

/**
 * POST /api/v1/admin/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, matricule, password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Mot de passe requis' });
    }
    const identifier = email || matricule;
    if (!identifier) {
      return res.status(400).json({ message: 'Email ou matricule requis' });
    }

    const where = email
      ? { email: email.trim() }
      : { matricule: String(matricule).trim() };
    const user_dirga = await DirgaU.findOne({ where });

    if (!user_dirga) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return res.status(400).json({ message: "Identifiant ou mot de passe incorrect" });
    }

    if (!user_dirga.can_work) {
      return res.status(403).json({ message: "Votre compte a été désactivé" });
    }

    const is_password = await bcrypt.compare(password, user_dirga.password);
    if (!is_password) {
      return res.status(400).json({ message: "Identifiant ou mot de passe incorrect" });
    }

    await user_dirga.update({ last_login: new Date() });

    const payload = {
      id: user_dirga.id,
      email: user_dirga.email,
      first_name: user_dirga.first_name,
      last_name: user_dirga.last_name,
      type: user_dirga.type
    };
    const secret = process.env.EMPLOYEUR_KEY || process.env.JWT_SECRET || process.env.key || 'your-secret-key';
    const token = jwt.sign(payload, secret, { expiresIn: '2d' });

    const boUser = toBoUser(user_dirga);
    return res.status(200).json({
      success: true,
      token,
      user: boUser
    });
  } catch (error) {
    console.error('[ADMIN_LOGIN] Error:', error);
    return res.status(500).json({ message: 'Erreur interne' });
  }
});

/**
 * GET /api/v1/admin/get_current_user
 */
router.get('/get_current_user', verifyToken, async (req, res) => {
  try {
    const user = await DirgaU.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    return res.status(200).json(toBoUser(user));
  } catch (error) {
    console.error('[ADMIN_GET_CURRENT_USER] Error:', error);
    return res.status(400).json({ message: error.message || 'Error' });
  }
});

// ============================================
// 2. STATISTIQUES ET RÉCAPITULATIFS
// ============================================

/**
 * GET /api/v1/admin/recap
 */
router.get('/recap', verifyToken, async (req, res) => {
  try {
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
    console.error('[ADMIN_RECAP] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

// ============================================
// 3. GESTION DES EMPLOYEURS
// ============================================

/**
 * GET /api/v1/admin/get_employeur
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
    console.error('[ADMIN_GET_EMPLOYEUR] Error:', error);
    return res.status(400).json({ message: 'error' });
  }
});

/**
 * GET /api/v1/admin/adhesion/:numero
 */
router.get('/adhesion/:numero', verifyToken, async (req, res) => {
  try {
    const numero = req.params.numero.trim();

    if (!numero || numero.length < 10) {
      return res.status(400).json({ message: 'Numéro d\'immatriculation invalide' });
    }

    const existingEmployeur = await Employeur.findOne({
      where: { no_immatriculation: numero }
    });

    if (existingEmployeur) {
      return res.status(400).json({ message: 'Ce numero est déjà employeur dans le systeme' });
    }

    const existingAdhesion = await Adhesion.findOne({
      where: { no_immatriculation: numero }
    });

    if (existingAdhesion) {
      return res.status(400).json({ message: "Ce numero est dans l'adhesion" });
    }

    try {
      const response = await axios.get(`${util_link}/anciencode/verify/${numero}`, {
        timeout: 10000
      });

      if (response.status === 200 && response.data) {
        const data = response.data;

        const requester = await RequestEmployeur.create({
          first_name: data.first_name || '',
          last_name: data.last_name || ''
        });

        await Employeur.create({
          request_employeurId: requester.id,
          is_insert_oldDB: true,
          is_immatriculed: true,
          is_new_compamy: false,
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
      console.error('[ADMIN_ADHESION] Old DB API error:', axiosError.message);
      return res.status(400).json({ message: 'Veuillez reessayer' });
    }
  } catch (error) {
    console.error('[ADMIN_ADHESION] Error:', error);
    return res.status(500).json({ message: 'Erreur lors de l\'ajout de l\'employeur' });
  }
});

/**
 * POST /api/v1/admin/send_account/:id
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

    if (!email || !phone_number || !first_name || !last_name) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Données manquantes' });
    }

    const employeur = await Employeur.findByPk(employeurId, { transaction });
    if (!employeur) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Employeur non trouvé' });
    }

    employeur.email = email;
    employeur.phone_number = phone_number;
    if (category) employeur.category = category;
    if (adresse) employeur.adresse = adresse;
    await employeur.save({ transaction });

    const oldUser = await Users.findOne({
      where: { user_identify: employeur.no_immatriculation }
    });
    if (oldUser) {
      await oldUser.destroy({ transaction });
    }

    const nohased_password = generateUniqueCode(9);
    const user_password_hashed = await hashPassword(nohased_password);

    const employeurUtility = require('../XYemployeurs/utility');
    try {
      const token = await employeurUtility.getPaylicanToken();
      if (token && employeurUtility.paylican_create_company) {
        await employeurUtility.paylican_create_company(employeur, token, employeur.no_immatriculation);
      }
    } catch (paylicanError) {
      console.warn('[ADMIN_SEND_ACCOUNT] Paylican error (non-blocking):', paylicanError.message);
    }

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

    user.first_name = first_name;
    user.last_name = last_name;
    await user.save({ transaction });

    await transaction.commit();

    try {
      await employeurUtility.addingUserPaylican(user, employeur);
      await sendMailAdhesion(employeur, nohased_password);
    } catch (externalError) {
      console.error('[ADMIN_SEND_ACCOUNT] External service error (non-blocking):', externalError);
    }

    return res.status(200).json({ message: 'Compte envoyé avec succes' });
  } catch (error) {
    await transaction.rollback();
    console.error('[ADMIN_SEND_ACCOUNT] Error:', error);
    return res.status(400).json({ message: error.message || 'Erreur lors de la création du compte' });
  }
});

/**
 * GET /api/v1/admin/get_agent_his_employeur
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
    console.error('[ADMIN_GET_AGENT_HIS_EMPLOYEUR] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

// ============================================
// 4. GESTION DES EMPLOYÉS
// ============================================

/**
 * POST /api/v1/admin/save_his_employe
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
    console.error('[ADMIN_SAVE_HIS_EMPLOYE] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * POST /api/v1/admin/save_his_employe_non_imma
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
    console.error('[ADMIN_SAVE_HIS_EMPLOYE_NON_IMMA] Error:', error);
    return res.status(400).json({ message: error.message || 'erreur' });
  }
});

/**
 * POST /api/v1/admin/save_his_employe_exist
 */
router.post('/save_his_employe_exist', verifyToken, async (req, res) => {
  try {
    if (!req.body.data || !Array.isArray(req.body.data) || req.body.data.length === 0) {
      return res.status(400).json({ message: 'Données invalides' });
    }
    const jobId = await addJob({ type: 'exist_employe', data: req.body.data });
    return res.status(200).json({ message: 'save_employe', jobId });
  } catch (error) {
    console.error('[ADMIN_SAVE_HIS_EMPLOYE_EXIST] Error:', error);
    return res.status(400).json({ message: error.message || 'erreur' });
  }
});

/**
 * GET /api/v1/admin/get_agent_his_employe/:employeur_id
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
    console.error('[ADMIN_GET_AGENT_HIS_EMPLOYE] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * GET /api/v1/admin/get_all_employe/:employeur_id
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
    console.error('[ADMIN_GET_ALL_EMPLOYE] Error:', error);
    return res.status(400).json({ message: error.message });
  }
});

// ============================================
// 5. DASHBOARD STATS (page Accueil BO)
// ============================================

/**
 * GET /api/v1/admin/dashboard-stats
 * Retourne tous les indicateurs pour la page d'accueil du portail BO.
 */
router.get('/dashboard-stats', verifyToken, async (req, res) => {
  try {
    const { Op, fn, col } = require('sequelize');
    const CotisationEmployeur = require('../cotisation_employeur/model');
    const Demande = require('../demandes/model');

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = String(prevMonthDate.getMonth() + 1).padStart(2, '0');

    // --- KPIs ---
    const [
      totalEmployes,
      cotisationsMois,
      cotisationsPrevMois,
      declarationsMois,
      declarationsValidesMois,
      paiementsEnAttenteCount,
      paiementsEnAttenteMontant,
    ] = await Promise.all([
      Employe.count({ where: { is_imma: true, is_out: false } }),
      CotisationEmployeur.sum('total_cotisation', { where: { periode: currentMonth, year: currentYear } }),
      CotisationEmployeur.sum('total_cotisation', { where: { periode: prevMonth, year: prevYear } }),
      CotisationEmployeur.count({ where: { periode: currentMonth, year: currentYear } }),
      CotisationEmployeur.count({ where: { periode: currentMonth, year: currentYear, is_paid: true } }),
      CotisationEmployeur.count({ where: { is_paid: false } }),
      CotisationEmployeur.sum('total_cotisation', { where: { is_paid: false } }),
    ]);

    const cotMois = cotisationsMois || 0;
    const cotPrev = cotisationsPrevMois || 0;
    const trendCotisations = cotPrev > 0
      ? Math.round(((cotMois - cotPrev) / cotPrev) * 1000) / 10
      : 0;
    const tauxValidation = declarationsMois > 0
      ? Math.round((declarationsValidesMois / declarationsMois) * 100)
      : 0;

    // --- Évolution mensuelle (5 derniers mois) ---
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const evolutionPromises = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      evolutionPromises.push(
        Promise.all([
          CotisationEmployeur.sum('total_cotisation', { where: { periode: mo, year: yr } }),
          CotisationEmployeur.count({ where: { periode: mo, year: yr } }),
        ]).then(([cotSum, declCount]) => ({
          month: monthNames[d.getMonth()],
          cotisations: Math.round((cotSum || 0) / 1000000),
          declarations: declCount || 0,
        }))
      );
    }
    const evolutionMensuelle = await Promise.all(evolutionPromises);

    // --- Performance hebdo (7 jours glissants vs semaine précédente) ---
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const hebdoPromises = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(now.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      const prevDayStart = new Date(dayStart);
      prevDayStart.setDate(prevDayStart.getDate() - 7);
      const prevDayEnd = new Date(prevDayStart);
      prevDayEnd.setHours(23, 59, 59, 999);
      const dayLabel = dayNames[dayStart.getDay()];
      hebdoPromises.push(
        Promise.all([
          CotisationEmployeur.count({ where: { createdAt: { [Op.between]: [dayStart, dayEnd] } } }),
          CotisationEmployeur.count({ where: { createdAt: { [Op.between]: [prevDayStart, prevDayEnd] } } }),
        ]).then(([current, prev]) => ({ name: dayLabel, value: current, prev }))
      );
    }
    const performanceHebdo = await Promise.all(hebdoPromises);

    // --- Statut des dossiers (mois en cours) ---
    const startOfMonth = new Date(currentYear, now.getMonth(), 1);
    const [demandesEnCours, demandesTraitees, demandesRejetees] = await Promise.all([
      Demande.count({ where: { response: false, createdAt: { [Op.gte]: startOfMonth } } }),
      Demande.count({ where: { dirga_traite: true, DG_traite: true, createdAt: { [Op.gte]: startOfMonth } } }),
      Demande.count({ where: { status: { [Op.like]: '%Rejeté%' }, createdAt: { [Op.gte]: startOfMonth } } }),
    ]);
    const totalDossiers = (demandesEnCours + demandesTraitees + demandesRejetees) || 1;

    // --- Activité récente ---
    const [recentPaiements, recentEmployes] = await Promise.all([
      Paiement.findAll({
        where: { is_paid: true },
        order: [['paid_date', 'DESC']],
        limit: 4,
        attributes: ['id', 'paid_date'],
      }),
      Employe.findAll({
        where: { is_imma: true },
        order: [['updatedAt', 'DESC']],
        limit: 3,
        attributes: ['id', 'first_name', 'last_name', 'updatedAt'],
      }),
    ]);

    const activiteRecente = [
      ...recentPaiements.map(p => ({
        type: 'paiement',
        message: 'Paiement de cotisations effectué',
        date: p.paid_date,
      })),
      ...recentEmployes.map(e => ({
        type: 'immatriculation',
        message: `${e.first_name} ${e.last_name} immatriculé(e)`,
        date: e.updatedAt,
      })),
    ]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    // --- Échéances à venir (cotisations non payées) ---
    const echeancesRaw = await CotisationEmployeur.findAll({
      where: { is_paid: false },
      order: [['fin_echeance_principal', 'ASC'], ['createdAt', 'ASC']],
      limit: 5,
      attributes: ['id', 'periode', 'year', 'total_cotisation', 'fin_echeance_principal', 'employeurId'],
    });

    // --- Top 5 employeurs par cotisations payées ---
    const topCotisations = await CotisationEmployeur.findAll({
      where: { is_paid: true },
      attributes: [
        'employeurId',
        [fn('COUNT', col('id')), 'nb_cotisations'],
        [fn('SUM', col('total_cotisation')), 'total_cotise'],
      ],
      group: ['employeurId'],
      order: [[fn('COUNT', col('id')), 'DESC']],
      limit: 5,
    });

    const topIds = topCotisations.map(c => c.employeurId).filter(Boolean);
    const topEmployeursDetails = topIds.length > 0
      ? await Employeur.findAll({
          where: { id: { [Op.in]: topIds } },
          attributes: ['id', 'raison_sociale', 'sigle', 'effectif_total', 'effectif_homme', 'effectif_femme', 'effectif_apprentis', 'solde', 'no_immatriculation'],
        })
      : [];

    const topDetailsMap = {};
    topEmployeursDetails.forEach(e => { topDetailsMap[e.id] = e; });

    const topEmployeurs = topCotisations
      .filter(c => topDetailsMap[c.employeurId])
      .map(c => {
        const emp = topDetailsMap[c.employeurId];
        const effectif = emp.effectif_total || (emp.effectif_homme + emp.effectif_femme + emp.effectif_apprentis) || 0;
        return {
          id: emp.id,
          raison_sociale: emp.raison_sociale,
          sigle: emp.sigle,
          effectif_total: effectif,
          solde: emp.solde,
          no_immatriculation: emp.no_immatriculation,
          nb_cotisations_payees: parseInt(c.get('nb_cotisations')) || 0,
          total_cotise: parseInt(c.get('total_cotise')) || 0,
        };
      });

    // Charger les noms des employeurs pour les échéances (pas de belongsTo défini)
    const employeurIds = [...new Set(echeancesRaw.map(e => e.employeurId).filter(Boolean))];
    const employeursMap = {};
    if (employeurIds.length > 0) {
      const employeursList = await Employeur.findAll({
        where: { id: { [Op.in]: employeurIds } },
        attributes: ['id', 'raison_sociale'],
      });
      employeursList.forEach(emp => { employeursMap[emp.id] = emp.raison_sociale; });
    }

    return res.status(200).json({
      success: true,
      data: {
        kpis: {
          total_employes: totalEmployes,
          cotisations_mois: cotMois,
          trend_cotisations: trendCotisations,
          declarations_mois: declarationsMois,
          declarations_validees_mois: declarationsValidesMois,
          taux_validation: tauxValidation,
          paiements_en_attente_count: paiementsEnAttenteCount,
          paiements_en_attente_montant: paiementsEnAttenteMontant || 0,
        },
        evolution_mensuelle: evolutionMensuelle,
        performance_hebdo: performanceHebdo,
        statut_dossiers: [
          { name: 'Validés', value: Math.round((demandesTraitees / totalDossiers) * 100), count: demandesTraitees, color: '#1a4d2e' },
          { name: 'En attente', value: Math.round((demandesEnCours / totalDossiers) * 100), count: demandesEnCours, color: '#eab308' },
          { name: 'Rejetés', value: Math.round((demandesRejetees / totalDossiers) * 100), count: demandesRejetees, color: '#E30613' },
        ],
        top_employeurs: topEmployeurs,
        activite_recente: activiteRecente,
        echeances: echeancesRaw.map(e => {
          const echeanceDate = e.fin_echeance_principal ? new Date(e.fin_echeance_principal) : null;
          const isUrgent = echeanceDate ? echeanceDate <= now : false;
          const dateLabel = echeanceDate
            ? `${echeanceDate.getDate()} ${monthNames[echeanceDate.getMonth()]}`
            : `${e.periode}/${e.year}`;
          return {
            id: e.id,
            label: `${employeursMap[e.employeurId] || 'Déclaration'} – ${e.periode}/${e.year}`,
            montant: e.total_cotisation,
            date: dateLabel,
            urgent: isUrgent,
          };
        }),
      },
    });
  } catch (error) {
    console.error('[ADMIN_DASHBOARD_STATS] Error:', error);
    return res.status(500).json({ message: error.message || 'Erreur interne' });
  }
});

module.exports = router;
