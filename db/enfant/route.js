const express = require('express');
const router = express.Router();
const Enfant = require('./model');

// GET all enfants
router.get('/', async (req, res) => {
  try {
    const enfants = await Enfant.findAll({
      include: [
        { association: 'employe' },
        { association: 'conjoint' }
      ]
    });
    res.json(enfants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET enfant by id
router.get('/:id', async (req, res) => {
  try {
    const enfant = await Enfant.findByPk(req.params.id, {
      include: [
        { association: 'employe' },
        { association: 'conjoint' }
      ]
    });
    if (!enfant) {
      return res.status(404).json({ error: 'Enfant not found' });
    }
    res.json(enfant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create enfant
router.post('/', async (req, res) => {
  try {
    const enfant = await Enfant.create(req.body);
    res.status(201).json(enfant);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update enfant
router.put('/:id', async (req, res) => {
  try {
    const enfant = await Enfant.findByPk(req.params.id);
    if (!enfant) {
      return res.status(404).json({ error: 'Enfant not found' });
    }
    await enfant.update(req.body);
    res.json(enfant);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE enfant
router.delete('/:id', async (req, res) => {
  try {
    const enfant = await Enfant.findByPk(req.params.id);
    if (!enfant) {
      return res.status(404).json({ error: 'Enfant not found' });
    }
    await enfant.destroy();
    res.json({ message: 'Enfant deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
