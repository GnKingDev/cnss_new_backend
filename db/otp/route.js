const express = require('express');
const router = express.Router();
const Otp = require('./model');

// GET all otps
router.get('/', async (req, res) => {
  try {
    const otps = await Otp.findAll({
      include: [{ association: 'user' }]
    });
    res.json(otps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET otp by id
router.get('/:id', async (req, res) => {
  try {
    const otp = await Otp.findByPk(req.params.id, {
      include: [{ association: 'user' }]
    });
    if (!otp) {
      return res.status(404).json({ error: 'OTP not found' });
    }
    res.json(otp);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create otp
router.post('/', async (req, res) => {
  try {
    const otp = await Otp.create(req.body);
    res.status(201).json(otp);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update otp
router.put('/:id', async (req, res) => {
  try {
    const otp = await Otp.findByPk(req.params.id);
    if (!otp) {
      return res.status(404).json({ error: 'OTP not found' });
    }
    await otp.update(req.body);
    res.json(otp);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE otp
router.delete('/:id', async (req, res) => {
  try {
    const otp = await Otp.findByPk(req.params.id);
    if (!otp) {
      return res.status(404).json({ error: 'OTP not found' });
    }
    await otp.destroy();
    res.json({ message: 'OTP deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
