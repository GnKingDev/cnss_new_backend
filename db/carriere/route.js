const express = require('express');
const router = express.Router();
const Carer = require('./model');

// GET all carrieres
router.get('/', async (req, res) => {
  try {
    const carrieres = await Carer.findAll({
      include: [
        { association: 'employe' },
        { association: 'employeur' }
      ]
    });
    res.json(carrieres);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET carriere by id
router.get('/:id', async (req, res) => {
  try {
    const carriere = await Carer.findByPk(req.params.id, {
      include: [
        { association: 'employe' },
        { association: 'employeur' }
      ]
    });
    if (!carriere) {
      return res.status(404).json({ error: 'Carriere not found' });
    }
    res.json(carriere);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create carriere
router.post('/', async (req, res) => {
  try {
    const carriere = await Carer.create(req.body);
    res.status(201).json(carriere);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update carriere
router.put('/:id', async (req, res) => {
  try {
    const carriere = await Carer.findByPk(req.params.id);
    if (!carriere) {
      return res.status(404).json({ error: 'Carriere not found' });
    }
    await carriere.update(req.body);
    res.json(carriere);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE carriere
router.delete('/:id', async (req, res) => {
  try {
    const carriere = await Carer.findByPk(req.params.id);
    if (!carriere) {
      return res.status(404).json({ error: 'Carriere not found' });
    }
    await carriere.destroy();
    res.json({ message: 'Carriere deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
