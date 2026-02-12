const express = require('express');
const router = express.Router();
const Quitus = require('./model');

// GET all quitus
router.get('/', async (req, res) => {
  try {
    const quitus = await Quitus.findAll({
      include: [
        { association: 'employeur' },
        { association: 'demande' }
      ]
    });
    res.json(quitus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET quitus by id
router.get('/:id', async (req, res) => {
  try {
    const quitus = await Quitus.findByPk(req.params.id, {
      include: [
        { association: 'employeur' },
        { association: 'demande' }
      ]
    });
    if (!quitus) {
      return res.status(404).json({ error: 'Quitus not found' });
    }
    res.json(quitus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create quitus
router.post('/', async (req, res) => {
  try {
    const quitus = await Quitus.create(req.body);
    res.status(201).json(quitus);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update quitus
router.put('/:id', async (req, res) => {
  try {
    const quitus = await Quitus.findByPk(req.params.id);
    if (!quitus) {
      return res.status(404).json({ error: 'Quitus not found' });
    }
    await quitus.update(req.body);
    res.json(quitus);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE quitus
router.delete('/:id', async (req, res) => {
  try {
    const quitus = await Quitus.findByPk(req.params.id);
    if (!quitus) {
      return res.status(404).json({ error: 'Quitus not found' });
    }
    await quitus.destroy();
    res.json({ message: 'Quitus deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
