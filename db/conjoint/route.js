const express = require('express');
const router = express.Router();
const Conjoint = require('./model');

// GET all conjoints
router.get('/', async (req, res) => {
  try {
    const conjoints = await Conjoint.findAll({
      include: [{ association: 'employe' }]
    });
    res.json(conjoints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET conjoint by id
router.get('/:id', async (req, res) => {
  try {
    const conjoint = await Conjoint.findByPk(req.params.id, {
      include: [{ association: 'employe' }]
    });
    if (!conjoint) {
      return res.status(404).json({ error: 'Conjoint not found' });
    }
    res.json(conjoint);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create conjoint
router.post('/', async (req, res) => {
  try {
    const conjoint = await Conjoint.create(req.body);
    res.status(201).json(conjoint);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update conjoint
router.put('/:id', async (req, res) => {
  try {
    const conjoint = await Conjoint.findByPk(req.params.id);
    if (!conjoint) {
      return res.status(404).json({ error: 'Conjoint not found' });
    }
    await conjoint.update(req.body);
    res.json(conjoint);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE conjoint
router.delete('/:id', async (req, res) => {
  try {
    const conjoint = await Conjoint.findByPk(req.params.id);
    if (!conjoint) {
      return res.status(404).json({ error: 'Conjoint not found' });
    }
    await conjoint.destroy();
    res.json({ message: 'Conjoint deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
