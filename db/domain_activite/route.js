const express = require('express');
const router = express.Router();
const Activity = require('./model');

// GET all activities
router.get('/', async (req, res) => {
  try {
    const activities = await Activity.findAll();
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET activity by id
router.get('/:id', async (req, res) => {
  try {
    const activity = await Activity.findByPk(req.params.id);
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create activity
router.post('/', async (req, res) => {
  try {
    const activity = await Activity.create(req.body);
    res.status(201).json(activity);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update activity
router.put('/:id', async (req, res) => {
  try {
    const activity = await Activity.findByPk(req.params.id);
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    await activity.update(req.body);
    res.json(activity);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE activity
router.delete('/:id', async (req, res) => {
  try {
    const activity = await Activity.findByPk(req.params.id);
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    await activity.destroy();
    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
