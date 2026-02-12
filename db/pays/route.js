const express = require('express');
const router = express.Router();
const Pays = require('./model');

// GET all pays
router.get('/', async (req, res) => {
  try {
    const pays = await Pays.findAll();
    res.json(pays);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET pays by id
router.get('/:id', async (req, res) => {
  try {
    const pays = await Pays.findByPk(req.params.id);
    if (!pays) {
      return res.status(404).json({ error: 'Pays not found' });
    }
    res.json(pays);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create pays
router.post('/', async (req, res) => {
  try {
    const pays = await Pays.create(req.body);
    res.status(201).json(pays);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update pays
router.put('/:id', async (req, res) => {
  try {
    const pays = await Pays.findByPk(req.params.id);
    if (!pays) {
      return res.status(404).json({ error: 'Pays not found' });
    }
    await pays.update(req.body);
    res.json(pays);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE pays
router.delete('/:id', async (req, res) => {
  try {
    const pays = await Pays.findByPk(req.params.id);
    if (!pays) {
      return res.status(404).json({ error: 'Pays not found' });
    }
    await pays.destroy();
    res.json({ message: 'Pays deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
