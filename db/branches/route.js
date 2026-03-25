const express = require('express');
const router = express.Router();
const Branche = require('./model');

// GET all branches
router.get('/', async (req, res) => {
  try {
    const branches = await Branche.findAll({ order: [['name', 'ASC']] });
    res.json({ success: true, data: branches });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET branche by id
router.get('/:id', async (req, res) => {
  try {
    const branche = await Branche.findByPk(req.params.id, {
      include: [{ association: 'activity' }]
    });
    if (!branche) {
      return res.status(404).json({ error: 'Branche not found' });
    }
    res.json(branche);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create branche
router.post('/', async (req, res) => {
  try {
    const branche = await Branche.create(req.body);
    res.status(201).json(branche);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update branche
router.put('/:id', async (req, res) => {
  try {
    const branche = await Branche.findByPk(req.params.id);
    if (!branche) {
      return res.status(404).json({ error: 'Branche not found' });
    }
    await branche.update(req.body);
    res.json(branche);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE branche
router.delete('/:id', async (req, res) => {
  try {
    const branche = await Branche.findByPk(req.params.id);
    if (!branche) {
      return res.status(404).json({ error: 'Branche not found' });
    }
    await branche.destroy();
    res.json({ message: 'Branche deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
