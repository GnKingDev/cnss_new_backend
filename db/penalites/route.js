const express = require('express');
const router = express.Router();
const Penalite = require('./model');
const { EmployeurToken } = require('../users/utility');

/**
 * GET /me — Pénalités de l'employeur connecté (token employeur).
 * Doit être déclaré avant GET /:id pour ne pas intercepter "me" comme un id.
 */
router.get('/me', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    if (employeurId == null) {
      return res.status(400).json({ message: 'Profil employeur introuvable' });
    }
    const penalites = await Penalite.findAll({
      where: { employeurId },
      include: [{ association: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(penalites);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all penalites
router.get('/', async (req, res) => {
  try {
    const penalites = await Penalite.findAll({
      include: [{ association: 'employeur' }]
    });
    res.json(penalites);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET penalite by id
router.get('/:id', async (req, res) => {
  try {
    const penalite = await Penalite.findByPk(req.params.id, {
      include: [{ association: 'employeur' }]
    });
    if (!penalite) {
      return res.status(404).json({ error: 'Penalite not found' });
    }
    res.json(penalite);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create penalite
router.post('/', async (req, res) => {
  try {
    const penalite = await Penalite.create(req.body);
    res.status(201).json(penalite);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update penalite
router.put('/:id', async (req, res) => {
  try {
    const penalite = await Penalite.findByPk(req.params.id);
    if (!penalite) {
      return res.status(404).json({ error: 'Penalite not found' });
    }
    await penalite.update(req.body);
    res.json(penalite);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE penalite
router.delete('/:id', async (req, res) => {
  try {
    const penalite = await Penalite.findByPk(req.params.id);
    if (!penalite) {
      return res.status(404).json({ error: 'Penalite not found' });
    }
    await penalite.destroy();
    res.json({ message: 'Penalite deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
