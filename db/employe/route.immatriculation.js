const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const Employeur = require('../XYemployeurs/model');
const Employe = require('./model');

// ── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page      = Math.max(1, parseInt(req.query.page)  || 1);
    const limit     = Math.min(100, parseInt(req.query.limit) || 20);
    const offset    = (page - 1) * limit;
    const recherche = (req.query.recherche || '').trim();

    // Tous les employés non validés avec leur employeur
    const employes = await Employe.findAll({
      where: { is_imma: false },
      attributes: ['id', 'employeurId'],
      include: [{
        model: Employeur,
        as: 'employeur',
        attributes: ['id', 'raison_sociale', 'no_immatriculation', 'email'],
        where: recherche ? {
          [Op.or]: [
            { raison_sociale:     { [Op.like]: `%${recherche}%` } },
            { no_immatriculation: { [Op.like]: `%${recherche}%` } },
          ],
        } : undefined,
        required: true,
      }],
      raw: true,
      nest: true,
    });

    // Grouper par employeur en JS
    const map = {};
    for (const e of employes) {
      const emp = e.employeur;
      if (!emp || !emp.id) continue;
      if (!map[emp.id]) {
        map[emp.id] = { ...emp, non_valides: 0 };
      }
      map[emp.id].non_valides++;
    }

    const all = Object.values(map).sort((a, b) => b.non_valides - a.non_valides);
    const total = all.length;
    const data  = all.slice(offset, offset + limit);

    return res.status(200).json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[IMMAT_DIRGA] GET /:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /:employeurId/employes ─────────────────────────────────────────────────
router.get('/:employeurId/employes', async (req, res) => {
  try {
    const employeurId = parseInt(req.params.employeurId, 10);
    if (isNaN(employeurId)) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    const employeur = await Employeur.findByPk(employeurId, {
      attributes: ['id', 'raison_sociale', 'no_immatriculation', 'email'],
    });
    if (!employeur) {
      return res.status(404).json({ success: false, message: 'Employeur introuvable' });
    }

    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(200, parseInt(req.query.limit) || 50);
    const offset  = (page - 1) * limit;
    const is_imma = req.query.is_imma; // 'true' | 'false' | undefined

    const where = { employeurId };
    if (is_imma === 'true')  where.is_imma = true;
    if (is_imma === 'false') where.is_imma = false;

    const [employes, valides, non_valides] = await Promise.all([
      Employe.findAll({
        where,
        attributes: [
          'id', 'first_name', 'last_name', 'matricule', 'no_immatriculation',
          'gender', 'date_of_birth', 'is_imma', 'is_adhesion', 'immatriculation_date',
          'phone_number', 'email', 'createdAt',
        ],
        order: [['last_name', 'ASC']],
        limit,
        offset,
      }),
      Employe.count({ where: { employeurId, is_imma: true  } }),
      Employe.count({ where: { employeurId, is_imma: false } }),
    ]);

    const total = await Employe.count({ where });

    return res.status(200).json({
      success: true,
      data: {
        employeur: {
          id: employeur.id,
          raison_sociale: employeur.raison_sociale,
          no_immatriculation: employeur.no_immatriculation,
        },
        employes,
        stats: { total: valides + non_valides, valides, non_valides },
      },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[IMMAT_DIRGA] GET /:id/employes:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
