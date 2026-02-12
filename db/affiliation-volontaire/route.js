const express = require('express');
const router = express.Router();
const AffiliationVolontaire = require('./model');

// GET all affiliations volontaires
router.get('/', async (req, res) => {
  try {
    const affiliations = await AffiliationVolontaire.findAll({
      include: [
        { association: 'branche' },
        { association: 'prefecture' }
      ]
    });
    res.json(affiliations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET affiliation volontaire by id
router.get('/:id', async (req, res) => {
  try {
    const affiliation = await AffiliationVolontaire.findByPk(req.params.id, {
      include: [
        { association: 'branche' },
        { association: 'prefecture' }
      ]
    });
    if (!affiliation) {
      return res.status(404).json({ error: 'Affiliation volontaire not found' });
    }
    res.json(affiliation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create affiliation volontaire
router.post('/', async (req, res) => {
  try {
    const affiliation = await AffiliationVolontaire.create(req.body);
    res.status(201).json(affiliation);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update affiliation volontaire
router.put('/:id', async (req, res) => {
  try {
    const affiliation = await AffiliationVolontaire.findByPk(req.params.id);
    if (!affiliation) {
      return res.status(404).json({ error: 'Affiliation volontaire not found' });
    }
    await affiliation.update(req.body);
    res.json(affiliation);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE affiliation volontaire
router.delete('/:id', async (req, res) => {
  try {
    const affiliation = await AffiliationVolontaire.findByPk(req.params.id);
    if (!affiliation) {
      return res.status(404).json({ error: 'Affiliation volontaire not found' });
    }
    await affiliation.destroy();
    res.json({ message: 'Affiliation volontaire deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
