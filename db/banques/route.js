const express = require('express');
const router = express.Router();
const Banque = require('./model');

// GET all banques
router.get('/', async (req, res) => {
  try {
    const banques = await Banque.findAll();
    res.json(banques);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET banque by id
router.get('/:id', async (req, res) => {
  try {
    const banque = await Banque.findByPk(req.params.id);
    if (!banque) {
      return res.status(404).json({ error: 'Banque not found' });
    }
    res.json(banque);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create banque
router.post('/', async (req, res) => {
  try {
    const banque = await Banque.create(req.body);
    res.status(201).json(banque);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update banque
router.put('/:id', async (req, res) => {
  try {
    const banque = await Banque.findByPk(req.params.id);
    if (!banque) {
      return res.status(404).json({ error: 'Banque not found' });
    }
    await banque.update(req.body);
    res.json(banque);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE banque
router.delete('/:id', async (req, res) => {
  try {
    const banque = await Banque.findByPk(req.params.id);
    if (!banque) {
      return res.status(404).json({ error: 'Banque not found' });
    }
    await banque.destroy();
    res.json({ message: 'Banque deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
