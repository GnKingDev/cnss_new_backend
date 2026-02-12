const express = require('express');
const router = express.Router();
const RequestEmployeur = require('./model');

// GET all request_employeur
router.get('/', async (req, res) => {
  try {
    const requests = await RequestEmployeur.findAll();
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET request_employeur by id
router.get('/:id', async (req, res) => {
  try {
    const request = await RequestEmployeur.findByPk(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create request_employeur
router.post('/', async (req, res) => {
  try {
    const request = await RequestEmployeur.create(req.body);
    res.status(201).json(request);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update request_employeur
router.put('/:id', async (req, res) => {
  try {
    const request = await RequestEmployeur.findByPk(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    await request.update(req.body);
    res.json(request);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE request_employeur
router.delete('/:id', async (req, res) => {
  try {
    const request = await RequestEmployeur.findByPk(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    await request.destroy();
    res.json({ message: 'Request deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
