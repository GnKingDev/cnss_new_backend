const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AffiliationVolontaire = require('./model');

// Multer — stockage dans /uploads/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage });

const include = [
  { association: 'branche' },
  { association: 'prefecture' },
];

// GET /stats
router.get('/stats', async (req, res) => {
  try {
    const total = await AffiliationVolontaire.count();
    const valide = await AffiliationVolontaire.count({ where: { is_validated: true } });
    const non_valide = await AffiliationVolontaire.count({ where: { is_validated: false } });
    res.json({ success: true, data: { total, valide, non_valide } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET / - liste paginée avec recherche et filtre statut
router.get('/', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const where = {};

    if (search) {
      where[Op.or] = [
        { nom: { [Op.like]: `%${search}%` } },
        { prenom: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone_number: { [Op.like]: `%${search}%` } },
        { profession: { [Op.like]: `%${search}%` } },
        { no_immatriculation: { [Op.like]: `%${search}%` } },
      ];
    }

    if (status === 'valide') where.is_validated = true;
    else if (status === 'non_valide') where.is_validated = false;

    const { count, rows } = await AffiliationVolontaire.findAndCountAll({
      where,
      include,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      data: {
        items: rows,
        total: count,
        pages: Math.ceil(count / Number(limit)),
        page: Number(page),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const affiliation = await AffiliationVolontaire.findByPk(req.params.id, { include });
    if (!affiliation) return res.status(404).json({ success: false, error: 'Non trouvée' });
    res.json({ success: true, data: affiliation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - créer (avec upload fichiers optionnel)
router.post(
  '/',
  upload.fields([
    { name: 'cni_file_path', maxCount: 1 },
    { name: 'certificat_residence_file', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files || {};
      const data = { ...req.body };
      if (files.cni_file_path?.[0])
        data.cni_file_path = `/uploads/${files.cni_file_path[0].filename}`;
      if (files.certificat_residence_file?.[0])
        data.certificat_residence_file = `/uploads/${files.certificat_residence_file[0].filename}`;

      const affiliation = await AffiliationVolontaire.create(data);
      const result = await AffiliationVolontaire.findByPk(affiliation.id, { include });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
);

// POST /:id/validate - valider
router.post('/:id/validate', async (req, res) => {
  try {
    const affiliation = await AffiliationVolontaire.findByPk(req.params.id);
    if (!affiliation) return res.status(404).json({ success: false, error: 'Non trouvée' });

    let no_immatriculation = affiliation.no_immatriculation;
    if (!no_immatriculation) {
      const year = new Date().getFullYear();
      no_immatriculation = `AV-${year}-${String(affiliation.id).padStart(6, '0')}`;
    }

    await affiliation.update({
      is_validated: true,
      status: 'Validé',
      validated_date: new Date(),
      no_immatriculation,
    });

    const result = await AffiliationVolontaire.findByPk(affiliation.id, { include });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - mettre à jour
router.put('/:id', async (req, res) => {
  try {
    const affiliation = await AffiliationVolontaire.findByPk(req.params.id);
    if (!affiliation) return res.status(404).json({ success: false, error: 'Non trouvée' });
    await affiliation.update(req.body);
    const result = await AffiliationVolontaire.findByPk(affiliation.id, { include });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const affiliation = await AffiliationVolontaire.findByPk(req.params.id);
    if (!affiliation) return res.status(404).json({ success: false, error: 'Non trouvée' });
    await affiliation.destroy();
    res.json({ success: true, message: 'Supprimée avec succès' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
