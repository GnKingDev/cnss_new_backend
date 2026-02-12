const express = require('express');
const router = express.Router();
const Succursale = require('./model');

// GET all succursales
router.get('/', async (req, res) => {
  try {
    const succursales = await Succursale.findAll({
      include: [{ association: 'employeur' }]
    });
    res.json(succursales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET succursale by id
router.get('/:id', async (req, res) => {
  try {
    const succursale = await Succursale.findByPk(req.params.id, {
      include: [{ association: 'employeur' }]
    });
    if (!succursale) {
      return res.status(404).json({ error: 'Succursale not found' });
    }
    res.json(succursale);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create succursale
router.post('/', async (req, res) => {
  try {
    const succursale = await Succursale.create(req.body);
    res.status(201).json(succursale);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update succursale
router.put('/:id', async (req, res) => {
  try {
    const succursale = await Succursale.findByPk(req.params.id);
    if (!succursale) {
      return res.status(404).json({ error: 'Succursale not found' });
    }
    await succursale.update(req.body);
    res.json(succursale);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE succursale
router.delete('/:id', async (req, res) => {
  try {
    const succursale = await Succursale.findByPk(req.params.id);
    if (!succursale) {
      return res.status(404).json({ error: 'Succursale not found' });
    }
    await succursale.destroy();
    res.json({ message: 'Succursale deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
