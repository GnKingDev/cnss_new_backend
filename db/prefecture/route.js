const express = require('express');
const router = express.Router();
const Prefecture = require('./model');
const Pays = require('../pays/model');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');
const utility = require('./utility');
const { Op } = require('sequelize');

/**
 * Module `db/prefecture/route.js` – Gestion des préfectures
 * 
 * Ce module gère la récupération et la gestion des préfectures (subdivisions administratives) de la Guinée.
 * Base path: /api/v1/prefecture
 */

// Cache configuration
const CACHE_KEY = 'prefectures:all';
const CACHE_TTL = 86400; // 24 heures

/**
 * GET /api/v1/prefecture/get_all_prefecture
 * 
 * Récupère la liste de toutes les préfectures avec filtres et cache.
 * Route publique.
 */
router.get('/get_all_prefecture', async (req, res) => {
  try {
    // Build where clause for filters
    const whereClause = {};
    
    // Filter by paysId
    if (req.query.paysId) {
      const paysId = parseInt(req.query.paysId);
      if (!isNaN(paysId)) {
        whereClause.paysId = paysId;
      }
    }
    
    // Search by name
    if (req.query.search) {
      whereClause.name = { [Op.like]: `%${req.query.search.trim()}%` };
    }

    // Check cache only if no filters
    const hasFilters = Object.keys(whereClause).length > 0;
    const cacheKey = !hasFilters ? CACHE_KEY : null;

    if (cacheKey && utility.isRedisConnected()) {
      const redisClient = utility.getRedisClient();
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        return res.status(200).json(data);
      }
    }

    // Fetch from database
    const prefectures = await Prefecture.findAll({
      where: hasFilters ? whereClause : undefined,
      include: [{ 
        association: 'pays', 
        attributes: ['id', 'name', 'code'] 
      }],
      order: [['name', 'ASC']]
    });

    // Cache only if no filters
    if (cacheKey && utility.isRedisConnected() && prefectures.length > 0) {
      const redisClient = utility.getRedisClient();
      await redisClient.set(cacheKey, JSON.stringify(prefectures), 'EX', CACHE_TTL);
    }

    return res.status(200).json(prefectures);
  } catch (error) {
    console.error('[PREFECTURE] Error getting all prefectures:', error);
    return res.status(500).json({ 
      message: 'Erreur lors de la récupération des préfectures',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/v1/prefecture/:id
 * 
 * Récupère une préfecture spécifique par son ID.
 * Route publique.
 */
router.get('/:id', async (req, res) => {
  try {
    const prefectureId = parseInt(req.params.id);
    
    if (isNaN(prefectureId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const pref = await Prefecture.findByPk(prefectureId, {
      include: [{ 
        association: 'pays', 
        attributes: ['id', 'name', 'code'] 
      }]
    });

    if (!pref) {
      return res.status(404).json({ message: 'Préfecture non trouvée' });
    }

    return res.status(200).json(pref);
  } catch (error) {
    console.error('[PREFECTURE] Error getting prefecture by ID:', error);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/prefecture/by_code/:code
 * 
 * Récupère une préfecture par son code.
 * Route publique.
 */
router.get('/by_code/:code', async (req, res) => {
  try {
    const code = req.params.code.trim();
    
    if (!code) {
      return res.status(400).json({ message: 'Code manquant' });
    }

    const pref = await Prefecture.findOne({
      where: { code: code },
      include: [{ 
        association: 'pays', 
        attributes: ['id', 'name', 'code'] 
      }]
    });

    if (!pref) {
      return res.status(404).json({ message: 'Préfecture non trouvée' });
    }

    return res.status(200).json(pref);
  } catch (error) {
    console.error('[PREFECTURE] Error getting prefecture by code:', error);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/prefecture/by_pays/:paysId
 * 
 * Récupère toutes les préfectures d'un pays spécifique.
 * Route publique.
 */
router.get('/by_pays/:paysId', async (req, res) => {
  try {
    const paysId = parseInt(req.params.paysId);
    
    if (isNaN(paysId)) {
      return res.status(400).json({ message: 'ID pays invalide' });
    }

    const prefectures = await Prefecture.findAll({
      where: { paysId: paysId },
      include: [{ 
        association: 'pays', 
        attributes: ['id', 'name', 'code'] 
      }],
      order: [['name', 'ASC']]
    });

    return res.status(200).json(prefectures);
  } catch (error) {
    console.error('[PREFECTURE] Error getting prefectures by pays:', error);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * POST /api/v1/prefecture
 * 
 * Crée une nouvelle préfecture.
 * Route protégée (Admin uniquement).
 */
router.post('/', utility.verifyToken, async (req, res) => {
  try {
    const { name, code, paysId } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Nom requis' });
    }

    if (!code || !code.trim()) {
      return res.status(400).json({ message: 'Code requis' });
    }

    // Validate code format (should be alphanumeric, max 10 chars)
    if (code.length > 10 || !/^[A-Z0-9]+$/i.test(code)) {
      return res.status(400).json({ message: 'Format de code invalide' });
    }

    // Check if code already exists
    const existing = await Prefecture.findOne({ where: { code: code.trim() } });
    if (existing) {
      return res.status(400).json({ message: 'Ce code existe déjà' });
    }

    // Validate paysId if provided
    if (paysId) {
      const pays = await Pays.findByPk(paysId);
      if (!pays) {
        return res.status(400).json({ message: 'Pays non trouvé' });
      }
    }

    const newPrefecture = await Prefecture.create({
      name: name.trim().toUpperCase(), // Normalize to uppercase
      code: code.trim(),
      paysId: paysId || 1 // Default to Guinea (paysId = 1)
    });

    // Invalidate cache
    await utility.invalidateCache();

    return res.status(201).json(newPrefecture);
  } catch (error) {
    console.error('[PREFECTURE] Error creating prefecture:', error);
    return res.status(500).json({ 
      message: 'Erreur lors de la création',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * PUT /api/v1/prefecture/:id
 * 
 * Met à jour une préfecture existante.
 * Route protégée (Admin uniquement).
 */
router.put('/:id', utility.verifyToken, async (req, res) => {
  try {
    const prefectureId = parseInt(req.params.id);
    const { name, code, paysId } = req.body;

    if (isNaN(prefectureId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const pref = await Prefecture.findByPk(prefectureId);
    if (!pref) {
      return res.status(404).json({ message: 'Préfecture non trouvée' });
    }

    // Update name
    if (name && name.trim()) {
      pref.name = name.trim().toUpperCase();
    }

    // Update code
    if (code && code.trim()) {
      // Validate code format
      if (code.length > 10 || !/^[A-Z0-9]+$/i.test(code)) {
        return res.status(400).json({ message: 'Format de code invalide' });
      }

      // Check if code exists for another prefecture
      const existing = await Prefecture.findOne({ 
        where: { code: code.trim(), id: { [Op.ne]: prefectureId } } 
      });
      if (existing) {
        return res.status(400).json({ message: 'Ce code est déjà utilisé' });
      }
      pref.code = code.trim();
    }

    // Update paysId
    if (paysId !== undefined) {
      if (paysId === null) {
        pref.paysId = null;
      } else {
        const pays = await Pays.findByPk(paysId);
        if (!pays) {
          return res.status(400).json({ message: 'Pays non trouvé' });
        }
        pref.paysId = paysId;
      }
    }

    await pref.save();

    // Invalidate cache
    await utility.invalidateCache();

    // Reload with relations
    await pref.reload({
      include: [{ association: 'pays', attributes: ['id', 'name', 'code'] }]
    });

    return res.status(200).json(pref);
  } catch (error) {
    console.error('[PREFECTURE] Error updating prefecture:', error);
    return res.status(500).json({ 
      message: 'Erreur lors de la mise à jour',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * DELETE /api/v1/prefecture/:id
 * 
 * Supprime une préfecture (avec vérification des dépendances).
 * Route protégée (Admin uniquement).
 */
router.delete('/:id', utility.verifyToken, async (req, res) => {
  try {
    const prefectureId = parseInt(req.params.id);

    if (isNaN(prefectureId)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const pref = await Prefecture.findByPk(prefectureId);
    if (!pref) {
      return res.status(404).json({ message: 'Préfecture non trouvée' });
    }

    // Check dependencies: employeurs
    const countEmployeurs = await Employeur.count({ 
      where: { prefectureId: prefectureId } 
    });
    
    if (countEmployeurs > 0) {
      return res.status(400).json({ 
        message: `Impossible de supprimer: ${countEmployeurs} employeur(s) utilisent cette préfecture` 
      });
    }

    // Check dependencies: employes
    const countEmployes = await Employe.count({ 
      where: { prefectureId: prefectureId } 
    });
    
    if (countEmployes > 0) {
      return res.status(400).json({ 
        message: `Impossible de supprimer: ${countEmployes} employé(s) utilisent cette préfecture` 
      });
    }

    await pref.destroy();

    // Invalidate cache
    await utility.invalidateCache();

    return res.status(200).json({ message: 'Préfecture supprimée avec succès' });
  } catch (error) {
    console.error('[PREFECTURE] Error deleting prefecture:', error);
    return res.status(500).json({ 
      message: 'Erreur lors de la suppression',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
