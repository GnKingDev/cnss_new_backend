const express = require('express');
const router = express.Router();
const ExcelFile = require('./model');

// GET all excel files
router.get('/', async (req, res) => {
  try {
    const excelFiles = await ExcelFile.findAll({
      include: [
        { association: 'employeur' },
        { association: 'demande' }
      ]
    });
    res.json(excelFiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET excel file by id
router.get('/:id', async (req, res) => {
  try {
    const excelFile = await ExcelFile.findByPk(req.params.id, {
      include: [
        { association: 'employeur' },
        { association: 'demande' }
      ]
    });
    if (!excelFile) {
      return res.status(404).json({ error: 'Excel file not found' });
    }
    res.json(excelFile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create excel file
router.post('/', async (req, res) => {
  try {
    const excelFile = await ExcelFile.create(req.body);
    res.status(201).json(excelFile);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update excel file
router.put('/:id', async (req, res) => {
  try {
    const excelFile = await ExcelFile.findByPk(req.params.id);
    if (!excelFile) {
      return res.status(404).json({ error: 'Excel file not found' });
    }
    await excelFile.update(req.body);
    res.json(excelFile);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE excel file
router.delete('/:id', async (req, res) => {
  try {
    const excelFile = await ExcelFile.findByPk(req.params.id);
    if (!excelFile) {
      return res.status(404).json({ error: 'Excel file not found' });
    }
    await excelFile.destroy();
    res.json({ message: 'Excel file deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
