const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const BiometrieDemande = require('./model');
const BiometrieAgence = require('./agenceModel');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');
const { EmployeurToken } = require('../users/utility');

const TYPES = ['enrolement', 'mise_a_jour', 'renouvellement', 'remplacement', 'correction', 'rendez_vous'];
const STATUTS = ['en_attente', 'planifié', 'en_traitement', 'terminé', 'rejeté'];
const CRENEAUX = ['08:00 - 09:00', '09:00 - 10:00', '10:00 - 11:00', '11:00 - 12:00', '14:00 - 15:00', '15:00 - 16:00', '16:00 - 17:00'];

async function getNextReference(employeurId) {
  const year = new Date().getFullYear();
  const prefix = `BIO-${year}-`;
  const last = await BiometrieDemande.findOne({
    where: { reference: { [Op.like]: `${prefix}%` }, employeur_id: employeurId },
    order: [['id', 'DESC']],
    attributes: ['reference']
  });
  const lastNum = last && last.reference ? parseInt(last.reference.replace(prefix, ''), 10) || 0 : 0;
  return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
}

function formatDemande(d, emp) {
  return {
    id: d.reference || String(d.id),
    type: d.type || 'enrolement',
    employee_id: String(d.employee_id),
    employee_name: emp ? `${(emp.last_name || '').toUpperCase()} ${emp.first_name || ''}`.trim() : '',
    matricule: emp ? (emp.matricule || emp.no_immatriculation || '') : '',
    date_demande: d.createdAt ? (typeof d.createdAt === 'string' ? d.createdAt : (d.createdAt && d.createdAt.toISOString ? d.createdAt.toISOString() : null)) : null,
    date_rdv: d.date_rdv || null,
    lieu_rdv: d.lieu_rdv || null,
    statut: d.statut || 'en_attente',
    progression: d.progression != null ? d.progression : 0,
    created_at: d.createdAt,
    motif_remplacement: d.motif_remplacement || null,
    details_correction: d.champ_a_corriger ? { champ: d.champ_a_corriger, justification: d.justification } : null,
    historique: d.historique || []
  };
}

/**
 * GET /api/v1/biometrie/stats
 */
router.get('/stats', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const [total_demandes, en_attente, en_traitement, termines, rejetes, a_enroller] = await Promise.all([
      BiometrieDemande.count({ where: { employeur_id: employeurId } }),
      BiometrieDemande.count({ where: { employeur_id: employeurId, statut: { [Op.in]: ['en_attente', 'planifié'] } } }),
      BiometrieDemande.count({ where: { employeur_id: employeurId, statut: 'en_traitement' } }),
      BiometrieDemande.count({ where: { employeur_id: employeurId, statut: 'terminé' } }),
      BiometrieDemande.count({ where: { employeur_id: employeurId, statut: 'rejeté' } }),
      Employe.count({ where: { employeurId, is_out: false, [Op.or]: [{ has_biometric: false }, { has_biometric: null }] } })
    ]);
    return res.status(200).json({
      total_demandes,
      en_attente,
      en_traitement,
      termines,
      rejetes,
      a_enroller
    });
  } catch (err) {
    console.error('[BIOMETRIE_STATS]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/biometrie/demandes
 */
router.get('/demandes', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const { recherche, type, statut, page = 1, limit = 5 } = req.query;
    const where = { employeur_id: employeurId };
    if (type && type !== 'all') where.type = type;
    if (statut && statut !== 'all') where.statut = statut;
    const pagination = { page: Math.max(1, parseInt(page) || 1), limit: Math.min(50, Math.max(1, parseInt(limit) || 5)) };
    pagination.offset = (pagination.page - 1) * pagination.limit;

    if (recherche && String(recherche).trim()) {
      const search = String(recherche).trim();
      const empIds = await Employe.findAll({
        where: {
          employeurId: employeurId,
          [Op.or]: [
            { last_name: { [Op.like]: `%${search}%` } },
            { first_name: { [Op.like]: `%${search}%` } },
            { matricule: { [Op.like]: `%${search}%` } },
            { no_immatriculation: { [Op.like]: `%${search}%` } }
          ]
        },
        attributes: ['id']
      }).then(r => r.map(e => e.id));
      const orClause = [
        { reference: { [Op.like]: `%${search}%` } },
        ...(empIds.length ? [{ employee_id: { [Op.in]: empIds } }] : [])
      ];
      if (!isNaN(parseInt(search))) orClause.push({ id: parseInt(search) });
      where[Op.or] = orClause;
    }
    const include = [{ model: Employe, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'matricule', 'no_immatriculation'] }];

    const { count, rows } = await BiometrieDemande.findAndCountAll({
      where,
      include,
      order: [['createdAt', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset
    });

    const data = rows.map(d => {
      const dJson = d.toJSON ? d.toJSON() : d;
      return formatDemande(dJson, dJson.employee);
    });

    return res.status(200).json({ data, pagination: { page: pagination.page, limit: pagination.limit, total: count } });
  } catch (err) {
    console.error('[BIOMETRIE_LIST]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/biometrie/demandes/:id
 * :id peut être la référence (BIO-2024-001) ou l'id numérique
 */
router.get('/demandes/:id', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const idParam = req.params.id;
    const isNumeric = !isNaN(parseInt(idParam, 10));
    const where = { employeur_id: employeurId };
    if (isNumeric) where.id = parseInt(idParam, 10);
    else where.reference = idParam;

    const d = await BiometrieDemande.findOne({
      where,
      include: [{ model: Employe, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'matricule', 'no_immatriculation'] }]
    });
    if (!d) return res.status(404).json({ message: 'Demande non trouvée' });
    const dJson = d.toJSON ? d.toJSON() : d;
    return res.status(200).json(formatDemande(dJson, dJson.employee));
  } catch (err) {
    console.error('[BIOMETRIE_DETAIL]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/biometrie/employes
 */
router.get('/employes', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const { recherche, sans_biometrie, page = 1, limit = 50, matricule_debut, matricule_fin } = req.query;
    const where = { employeurId, is_out: false };
    if (sans_biometrie === 'true' || sans_biometrie === true) {
      where[Op.or] = [{ has_biometric: false }, { has_biometric: null }];
    }
    const search = recherche && String(recherche).trim();
    if (search && search.length >= 2) {
      where[Op.or] = [
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } },
        { matricule: { [Op.like]: `%${search}%` } },
        { no_immatriculation: { [Op.like]: `%${search}%` } }
      ];
    }
    if (matricule_debut && matricule_fin) {
      where.matricule = { [Op.between]: [String(matricule_debut).trim(), String(matricule_fin).trim()] };
    }
    const pagination = { page: Math.max(1, parseInt(page) || 1), limit: Math.min(500, Math.max(1, parseInt(limit) || 50)) };
    const { count, rows } = await Employe.findAndCountAll({
      where,
      attributes: ['id', 'first_name', 'last_name', 'matricule', 'no_immatriculation', 'date_of_birth', 'has_biometric', 'card_expiry', 'biometric_status'],
      order: [['last_name', 'ASC'], ['first_name', 'ASC']],
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit
    });
    const data = rows.map(e => {
      const emp = e.toJSON ? e.toJSON() : e;
      const status = emp.biometric_status || (emp.has_biometric ? (emp.card_expiry && new Date(emp.card_expiry) < new Date() ? 'expiré' : 'actif') : 'nouveau');
      return {
        id: String(emp.id),
        matricule: emp.matricule || emp.no_immatriculation || '',
        nom: (emp.last_name || '').toUpperCase(),
        prenom: emp.first_name || '',
        date_naissance: emp.date_of_birth ? (typeof emp.date_of_birth === 'string' ? emp.date_of_birth : emp.date_of_birth.toISOString ? emp.date_of_birth.toISOString().slice(0, 10) : null) : null,
        has_biometric: !!emp.has_biometric,
        card_expiry: emp.card_expiry || null,
        biometric_status: status
      };
    });
    return res.status(200).json({ data, pagination: { page: pagination.page, limit: pagination.limit, total: count } });
  } catch (err) {
    console.error('[BIOMETRIE_EMPLOYES]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * POST /api/v1/biometrie/demandes
 */
router.post('/demandes', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const body = req.body || {};
    const type = body.type;
    if (!type || !TYPES.includes(type)) return res.status(400).json({ message: 'Type de demande invalide' });
    if (body.consentement_obtenu !== true || body.information_effectuee !== true) {
      return res.status(400).json({ message: 'Consentement et information du salarié sont obligatoires' });
    }

    let employeeIds = [];
    if (body.employee_id) employeeIds = [String(body.employee_id)];
    else if (Array.isArray(body.employee_ids) && body.employee_ids.length) employeeIds = body.employee_ids.map(String);
    if (!employeeIds.length) return res.status(400).json({ message: 'Au moins un employé doit être sélectionné' });

    const employes = await Employe.findAll({
      where: { id: { [Op.in]: employeeIds.map(id => parseInt(id, 10)).filter(n => !isNaN(n)) }, employeurId: employeurId }
    });
    if (employes.length === 0) return res.status(404).json({ message: 'Aucun employé trouvé' });

    const created = [];
    for (const emp of employes) {
      const reference = await getNextReference(employeurId);
      const hist = [{ etape: 'Demande créée', date: new Date().toISOString() }];
      const demande = await BiometrieDemande.create({
        employeur_id: employeurId,
        employee_id: emp.id,
        reference,
        type,
        statut: 'en_attente',
        progression: 0,
        date_rdv: body.date_souhaitee || null,
        lieu_rdv: body.agence_id ? null : (body.mode_rdv === 'mobile' ? 'Kit Mobile' : null),
        mode_rdv: body.mode_rdv || null,
        agence_id: body.agence_id || null,
        date_souhaitee: body.date_souhaitee || null,
        creneau: body.creneau || null,
        motif_remplacement: body.motif_remplacement || null,
        champ_a_corriger: body.champ_a_corriger || null,
        justification: body.justification || null,
        consentement_obtenu: true,
        information_effectuee: true,
        historique: hist
      });
      if (body.date_souhaitee && body.agence_id) {
        const agence = await BiometrieAgence.findByPk(body.agence_id).catch(() => null);
        await demande.update({
          statut: 'planifié',
          date_rdv: body.date_souhaitee,
          lieu_rdv: agence ? agence.nom : body.agence_id,
          historique: [...hist, { etape: 'RDV planifié', date: new Date().toISOString() }]
        });
      }
      const withEmp = await BiometrieDemande.findByPk(demande.id, {
        include: [{ model: Employe, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'matricule', 'no_immatriculation'] }]
      });
      const dJson = withEmp.toJSON ? withEmp.toJSON() : withEmp;
      created.push(formatDemande(dJson, dJson.employee));
    }

    return res.status(201).json(created.length === 1 ? created[0] : { data: created });
  } catch (err) {
    console.error('[BIOMETRIE_CREATE]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/biometrie/agences
 */
router.get('/agences', EmployeurToken, async (req, res) => {
  try {
    const agences = await BiometrieAgence.findAll({
      where: {},
      order: [['nom', 'ASC']],
      raw: true
    });
    const data = agences.map(a => ({
      id: String(a.id),
      nom: a.nom || '',
      adresse: a.adresse || '',
      disponible: a.disponible !== false
    }));
    return res.status(200).json({ data });
  } catch (err) {
    console.error('[BIOMETRIE_AGENCES]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/biometrie/creneaux
 */
router.get('/creneaux', EmployeurToken, (req, res) => {
  return res.status(200).json({ data: CRENEAUX });
});

module.exports = router;
