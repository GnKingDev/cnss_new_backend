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
  try {
    const data_request = typeof req.body.request_affiliation_volontaire === 'string'
      ? JSON.parse(req.body.request_affiliation_volontaire)
      : req.body.request_affiliation_volontaire;

    const files = req.files || {};
    if (files.cni?.[0]) data_request.cni_file_path = files.cni[0].path;
    if (files.requester_picture?.[0]) data_request.requester_picture = files.requester_picture[0].path;
    if (files.certificat_residence?.[0]) data_request.certificat_residence_file = files.certificat_residence[0].path;

    const payload = mapRequestToModel(data_request);
    await AffiliationVolontaire.create(payload);
    return res.status(200).json({ message: "Demande d'affiliation volontaire soumise avec succès" });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
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
