const express = require('express');
const router = express.Router();
const Demploye = require('./model');

// GET all declarations
router.get('/', async (req, res) => {
  try {
    const declarations = await Demploye.findAll({
      include: [
        { association: 'employe' },
        { association: 'employeur' },
        { association: 'cotisation_employeur' }
      ]
    });
    res.json(declarations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET declaration by id
router.get('/:id', async (req, res) => {
  try {
    const declaration = await Demploye.findByPk(req.params.id, {
      include: [
        { association: 'employe' },
        { association: 'employeur' },
        { association: 'cotisation_employeur' }
      ]
    });
    if (!declaration) {
      return res.status(404).json({ error: 'Declaration not found' });
    }
    res.json(declaration);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create declaration
router.post('/', async (req, res) => {
  try {
    const declaration = await Demploye.create(req.body);
    res.status(201).json(declaration);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update declaration
router.put('/:id', async (req, res) => {
  try {
    const declaration = await Demploye.findByPk(req.params.id);
    if (!declaration) {
      return res.status(404).json({ error: 'Declaration not found' });
    }
    await declaration.update(req.body);
    res.json(declaration);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE declaration
router.delete('/:id', async (req, res) => {
  try {
    const declaration = await Demploye.findByPk(req.params.id);
    if (!declaration) {
      return res.status(404).json({ error: 'Declaration not found' });
    }
    await declaration.destroy();
    res.json({ message: 'Declaration deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
