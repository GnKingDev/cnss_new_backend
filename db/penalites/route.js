const express = require('express');
const router = express.Router();
const Penalite = require('./model');

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
