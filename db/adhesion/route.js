const express = require('express');
const router = express.Router();
const Adhesion = require('./model');

// GET all adhesions
router.get('/', async (req, res) => {
  try {
    const adhesions = await Adhesion.findAll();
    res.json(adhesions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET adhesion by id
router.get('/:id', async (req, res) => {
  try {
    const adhesion = await Adhesion.findByPk(req.params.id);
    if (!adhesion) {
      return res.status(404).json({ error: 'Adhesion not found' });
    }
    res.json(adhesion);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create adhesion
router.post('/', async (req, res) => {
  try {
    const adhesion = await Adhesion.create(req.body);
    res.status(201).json(adhesion);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update adhesion
router.put('/:id', async (req, res) => {
  try {
    const adhesion = await Adhesion.findByPk(req.params.id);
    if (!adhesion) {
      return res.status(404).json({ error: 'Adhesion not found' });
    }
    await adhesion.update(req.body);
    res.json(adhesion);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE adhesion
router.delete('/:id', async (req, res) => {
  try {
    const adhesion = await Adhesion.findByPk(req.params.id);
    if (!adhesion) {
      return res.status(404).json({ error: 'Adhesion not found' });
    }
    await adhesion.destroy();
    res.json({ message: 'Adhesion deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
