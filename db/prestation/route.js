const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Op } = require('sequelize');
const PrestationDemande = require('./model');
const PrestationDocument = require('./documentModel');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');
const Enfant = require('../enfant/model');
const { EmployeurToken } = require('../users/utility');

// Dossier upload prestations
const prestationsUploadDir = path.join(__dirname, '../../uploads/prestations');
if (!fs.existsSync(prestationsUploadDir)) {
  fs.mkdirSync(prestationsUploadDir, { recursive: true });
}

const prestationStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, prestationsUploadDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.pdf').toLowerCase();
    const name = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').substring(0, 40);
    cb(null, `${name}-${Date.now()}${ext}`);
  }
});
const prestationUpload = multer({
  storage: prestationStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 20 }
});

const STATUTS = ['brouillon', 'soumise', 'en_cours', 'demande_complements', 'completee', 'validee', 'rejetee', 'cloturee'];
const REQUEST_TYPES = ['retraite_normale', 'retraite_anticipee', 'invalidite', 'autre'];

const DOCUMENT_TYPE_IDS = [
  'lettre_transmission', 'carnet_assure', 'certificat_travail', 'certificat_cessation',
  'releve_salaire', 'certificat_residence', 'photos_identite', 'cni',
  'extrait_mariage', 'extraits_naissance_enfants', 'certificat_vie_enfants'
];

const PIECES_REQUISES = [
  { id: 'lettre_transmission', name: 'Lettre de transmission', description: "Faite par l'employeur ou le bénéficiaire, adressée au Directeur Général de la CNSS", required: true, accepted_formats: ['PDF'], max_size_mb: 5 },
  { id: 'carnet_assure', name: "Carnet ou Carte d'assuré social", description: 'Original ou copie certifiée conforme', required: true, accepted_formats: ['PDF', 'JPG', 'PNG'], max_size_mb: 5 },
  { id: 'certificat_travail', name: 'Certificat de travail', description: 'Avec la date d\'embauche et de débauche (fin de contrat)', required: true, accepted_formats: ['PDF'], max_size_mb: 5 },
  { id: 'certificat_cessation', name: 'Certificat de cessation de paiement (CCP)', description: 'Avec mention du dernier salaire perçu', required: true, accepted_formats: ['PDF'], max_size_mb: 5 },
  { id: 'releve_salaire', name: 'Relevé de salaire des 120 derniers mois', description: 'Soit les 10 dernières années de cotisation', required: true, accepted_formats: ['PDF'], max_size_mb: 5 },
  { id: 'certificat_residence', name: 'Certificat de Résidence', description: 'Document récent délivré par les autorités locales', required: true, accepted_formats: ['PDF', 'JPG', 'PNG'], max_size_mb: 5 },
  { id: 'photos_identite', name: "Quatre (4) photos d'identité", description: 'Format passeport, fond blanc, récentes', required: true, accepted_formats: ['JPG', 'PNG'], max_size_mb: 2 },
  { id: 'cni', name: 'Photocopie CNI recto-verso', description: "Carte d'identité nationale en cours de validité", required: true, accepted_formats: ['PDF', 'JPG', 'PNG'], max_size_mb: 5 },
  { id: 'extrait_mariage', name: 'Extrait de mariage légalisé', description: 'Si marié(e) - doit être légalisé par le tribunal', required: false, accepted_formats: ['PDF', 'JPG', 'PNG'], max_size_mb: 5 },
  { id: 'extraits_naissance_enfants', name: 'Extraits de naissance des enfants', description: "Pour chaque enfant de moins de 17 ans - légalisés par le tribunal", required: false, accepted_formats: ['PDF', 'JPG', 'PNG'], max_size_mb: 5 },
  { id: 'certificat_vie_enfants', name: 'Certificat de vie collective/individuelle', description: 'Pour les enfants de moins de 17 ans à charge', required: false, accepted_formats: ['PDF'], max_size_mb: 5 }
];

const AIDE = {
  processing_steps: [
    { step: 1, title: 'Dépôt de la demande', duration: 'Immédiat' },
    { step: 2, title: 'Vérification des pièces', duration: '5-7 jours' },
    { step: 3, title: 'Instruction du dossier', duration: '15-20 jours' },
    { step: 4, title: 'Commission de validation', duration: '7-10 jours' },
    { step: 5, title: 'Notification de décision', duration: '3-5 jours' }
  ],
  faq: [
    { question: 'Quelles sont les conditions pour bénéficier de la retraite normale ?', answer: "Pour bénéficier de la retraite normale, l'assuré doit avoir atteint l'âge légal de la retraite (60 ans en Guinée) et avoir cotisé un minimum de 180 mois (15 ans) au régime de sécurité sociale." },
    { question: 'Quel est le délai de traitement d\'une demande ?', answer: 'Le délai moyen de traitement est de 30 à 45 jours ouvrables à compter de la réception du dossier complet.' }
  ]
};

function formatDemandeItem(d, emp) {
  const docs = (d.documents || []).map(doc => ({
    id: String(doc.id),
    document_type_id: doc.document_type_id,
    name: doc.name,
    type: doc.mime_type || 'application/pdf',
    size: doc.size || 0,
    url: doc.path ? (doc.path.startsWith('http') ? doc.path : '/' + doc.path.replace(/^\/+/, '')) : null,
    uploaded_at: doc.createdAt,
    required: doc.required !== false,
    status: doc.status || 'uploaded'
  }));
  return {
    id: String(d.id),
    dossier_id: d.dossier_id || null,
    employee_id: String(d.employee_id),
    employee_name: emp ? `${(emp.last_name || '').toUpperCase()} ${emp.first_name || ''}`.trim() : '',
    employee_matricule: emp ? (emp.no_immatriculation || emp.matricule || '') : '',
    request_type: d.request_type || 'retraite_normale',
    departure_date: d.departure_date || null,
    motif: d.motif || null,
    status: d.status || 'brouillon',
    created_at: d.createdAt,
    updated_at: d.updatedAt,
    submitted_at: d.submitted_at || null,
    documents: docs
  };
}

async function getNextDossierId(employeurId) {
  const year = new Date().getFullYear();
  const prefix = `PEN-${year}-`;
  const last = await PrestationDemande.findOne({
    where: { dossier_id: { [Op.like]: `${prefix}%` }, employeur_id: employeurId },
    order: [['id', 'DESC']],
    attributes: ['dossier_id']
  });
  const lastNum = last && last.dossier_id ? parseInt(last.dossier_id.replace(prefix, ''), 10) || 0 : 0;
  return `${prefix}${String(lastNum + 1).padStart(5, '0')}`;
}

/**
 * GET /api/v1/prestations/stats
 * Compteurs réels pour le tableau de bord (remplace les mocks).
 */
router.get('/stats', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [brouillons, demandes_en_cours, a_completer, validees_ce_mois] = await Promise.all([
      PrestationDemande.count({ where: { employeur_id: employeurId, status: 'brouillon' } }),
      PrestationDemande.count({ where: { employeur_id: employeurId, status: 'en_cours' } }),
      PrestationDemande.count({ where: { employeur_id: employeurId, status: 'demande_complements' } }),
      PrestationDemande.count({
        where: {
          employeur_id: employeurId,
          status: 'validee',
          [Op.or]: [
            { updatedAt: { [Op.gte]: startOfMonth } },
            { submitted_at: { [Op.gte]: startOfMonth } }
          ]
        }
      })
    ]);

    return res.status(200).json({
      brouillons,
      demandes_en_cours,
      a_completer,
      validees_ce_mois
    });
  } catch (err) {
    console.error('[PRESTATIONS_STATS]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/prestations/demandes
 */
router.get('/demandes', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const { statut, brouillons, date_debut, date_fin, recherche, page = 1, limit = 10 } = req.query;
    const where = { employeur_id: employeurId };
    if (statut && String(statut).trim()) where.status = String(statut).trim();
    if (brouillons === '1' || brouillons === 1) where.status = 'brouillon';
    if (date_debut) where.createdAt = { ...where.createdAt, [Op.gte]: new Date(date_debut) };
    if (date_fin) where.createdAt = { ...where.createdAt, [Op.lte]: new Date(date_fin + 'T23:59:59.999Z') };
    const search = recherche && String(recherche).trim();
    const pagination = { page: Math.max(1, parseInt(page) || 1), limit: Math.min(50, Math.max(1, parseInt(limit) || 10)) };
    pagination.offset = (pagination.page - 1) * pagination.limit;

    if (search) {
      const empIds = await Employe.findAll({
        where: {
          employeurId,
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
        { dossier_id: { [Op.like]: `%${search}%` } },
        ...(empIds.length ? [{ employee_id: { [Op.in]: empIds } }] : [])
      ];
      if (!isNaN(parseInt(search))) orClause.push({ id: parseInt(search) });
      where[Op.or] = orClause;
    }

    const include = [
      { model: Employe, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'no_immatriculation', 'matricule'] },
      { model: PrestationDocument, as: 'documents', required: false }
    ];

    const { count, rows } = await PrestationDemande.findAndCountAll({
      where,
      include,
      order: [['createdAt', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset
    });

    const data = rows.map(d => {
      const dJson = d.toJSON ? d.toJSON() : d;
      const emp = dJson.employee;
      return formatDemandeItem(dJson, emp);
    });

    return res.status(200).json({
      data,
      pagination: { page: pagination.page, limit: pagination.limit, total: count }
    });
  } catch (err) {
    console.error('[PRESTATIONS_LIST]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/prestations/demandes/:id
 */
router.get('/demandes/:id', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const d = await PrestationDemande.findOne({
      where: { id, employeur_id: employeurId },
      include: [
        { model: Employeur, as: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation', 'adresse', 'phone_number', 'email', 'description', 'no_rccm', 'no_dni', 'sigle'] },
        { model: Employe, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'matricule', 'no_immatriculation', 'date_of_birth', 'date_first_embauche', 'worked_date', 'adress', 'place_of_birth'] },
        { model: PrestationDocument, as: 'documents', required: false }
      ]
    });
    if (!d) return res.status(404).json({ message: 'Demande non trouvée' });
    const dJson = d.toJSON ? d.toJSON() : d;
    const emp = dJson.employee;
    const employeur = dJson.employeur;
    const employment = dJson.employment || {};
    const docs = (dJson.documents || []).map(doc => ({
      id: String(doc.id),
      document_type_id: doc.document_type_id,
      name: doc.name,
      type: doc.mime_type || 'application/pdf',
      size: doc.size || 0,
      url: doc.path ? '/' + doc.path.replace(/^\/+/, '') : null,
      uploaded_at: doc.createdAt,
      required: doc.required !== false,
      status: doc.status || 'uploaded'
    }));
    const employerPayload = employeur ? {
      id: String(employeur.id),
      raison_sociale: employeur.raison_sociale || '',
      nif: employeur.no_rccm || employeur.no_dni || '',
      cnss_number: employeur.no_immatriculation || '',
      adresse: employeur.adresse || '',
      address: employeur.adresse || '',
      phone: employeur.phone_number || '',
      phone_number: employeur.phone_number || '',
      email: employeur.email || '',
      contact_rh: employeur.description || employeur.sigle || ''
    } : null;
    const out = {
      id: String(d.id),
      dossier_id: d.dossier_id || null,
      employee_id: String(d.employee_id),
      employee_name: emp ? `${(emp.last_name || '').toUpperCase()} ${emp.first_name || ''}`.trim() : '',
      employee_matricule: emp ? (emp.no_immatriculation || emp.matricule || '') : '',
      request_type: d.request_type || 'retraite_normale',
      departure_date: d.departure_date || null,
      motif: d.motif || null,
      observations: d.observations || null,
      status: d.status || 'brouillon',
      created_at: d.createdAt,
      updated_at: d.updatedAt,
      submitted_at: d.submitted_at || null,
      employer: employerPayload,
      employee: emp ? {
        id: String(emp.id),
        first_name: emp.first_name,
        last_name: emp.last_name,
        matricule: emp.matricule || '',
        cnss_number: emp.no_immatriculation || '',
        birth_date: emp.date_of_birth || null,
        hire_date: employment.date_embauche || emp.date_first_embauche || emp.worked_date || null,
        end_date: employment.date_debauche || null,
        last_salary: employment.dernier_salaire || null,
        total_declared_periods: null
      } : null,
      bank_info: d.bank_info || null,
      children: d.children || [],
      documents: docs
    };
    return res.status(200).json(out);
  } catch (err) {
    console.error('[PRESTATIONS_DETAIL]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * POST /api/v1/prestations/demandes
 * Body: multipart (demande = JSON string) ou application/json. Fichiers: document_<document_type_id>.
 */
router.post('/demandes', EmployeurToken, prestationUpload.any(), async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    let body = req.body && req.body.demande ? (typeof req.body.demande === 'string' ? JSON.parse(req.body.demande) : req.body.demande) : req.body || {};
    const soumise = body.soumise === true;
    const employeeId = parseInt(body.employee_id, 10);
    if (!employeeId) return res.status(400).json({ message: 'employee_id obligatoire' });
    const emp = await Employe.findOne({ where: { id: employeeId, employeurId } });
    if (!emp) return res.status(400).json({ message: 'Employé non trouvé ou n\'appartient pas à votre entreprise' });

    const status = soumise ? 'soumise' : 'brouillon';
    let dossier_id = null;
    let submitted_at = null;
    if (soumise) {
      dossier_id = await getNextDossierId(employeurId);
      submitted_at = new Date();
    }

    const demande = await PrestationDemande.create({
      employeur_id: employeurId,
      employee_id: employeeId,
      request_type: body.request_type || 'retraite_normale',
      departure_date: body.departure_date || null,
      motif: body.motif || null,
      observations: body.observations || null,
      status,
      dossier_id,
      submitted_at,
      employment: body.employment || null,
      bank_info: body.bank_info || null,
      children: body.children || null
    });

    const files = req.files || [];
    const toRel = (p) => (p && path.basename(p)) ? `uploads/prestations/${path.basename(p)}` : null;
    for (const f of files) {
      const typeId = f.fieldname.replace(/^document_/, '');
      if (!DOCUMENT_TYPE_IDS.includes(typeId)) continue;
      const piece = PIECES_REQUISES.find(p => p.id === typeId);
      await PrestationDocument.create({
        prestation_demande_id: demande.id,
        document_type_id: typeId,
        name: piece ? piece.name : typeId,
        path: toRel(f.path),
        size: f.size,
        mime_type: f.mimetype,
        required: piece ? piece.required : true,
        status: 'uploaded'
      });
    }

    const withDocs = await PrestationDemande.findByPk(demande.id, {
      include: [
        { model: Employe, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'no_immatriculation', 'matricule'] },
        { model: PrestationDocument, as: 'documents' }
      ]
    });
    const dJson = withDocs.toJSON ? withDocs.toJSON() : withDocs;
    return res.status(201).json(formatDemandeItem(dJson, dJson.employee));
  } catch (err) {
    if (err.name === 'SyntaxError') return res.status(400).json({ message: 'JSON demande invalide' });
    console.error('[PRESTATIONS_CREATE]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * PATCH /api/v1/prestations/demandes/:id
 */
router.patch('/demandes/:id', EmployeurToken, prestationUpload.any(), async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const d = await PrestationDemande.findOne({ where: { id, employeur_id: employeurId } });
    if (!d) return res.status(404).json({ message: 'Demande non trouvée' });
    if (d.status !== 'brouillon' && d.status !== 'demande_complements') {
      return res.status(400).json({ message: 'Seules les demandes en brouillon ou demande de compléments peuvent être modifiées' });
    }

    let body = req.body && req.body.demande ? (typeof req.body.demande === 'string' ? JSON.parse(req.body.demande) : req.body.demande) : req.body || {};
    const updates = {};
    if (body.request_type != null) updates.request_type = body.request_type;
    if (body.departure_date != null) updates.departure_date = body.departure_date;
    if (body.motif != null) updates.motif = body.motif;
    if (body.observations != null) updates.observations = body.observations;
    if (body.employment != null) updates.employment = body.employment;
    if (body.bank_info != null) updates.bank_info = body.bank_info;
    if (body.children != null) updates.children = body.children;
    if (Object.keys(updates).length) await d.update(updates);

    const files = req.files || [];
    const toRel = (p) => (p && path.basename(p)) ? `uploads/prestations/${path.basename(p)}` : null;
    for (const f of files) {
      const typeId = f.fieldname.replace(/^document_/, '');
      if (!DOCUMENT_TYPE_IDS.includes(typeId)) continue;
      const piece = PIECES_REQUISES.find(p => p.id === typeId);
      await PrestationDocument.create({
        prestation_demande_id: d.id,
        document_type_id: typeId,
        name: piece ? piece.name : typeId,
        path: toRel(f.path),
        size: f.size,
        mime_type: f.mimetype,
        required: piece ? piece.required : true,
        status: 'uploaded'
      });
    }

    const withDocs = await PrestationDemande.findByPk(d.id, {
      include: [
        { model: Employeur, as: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation', 'adresse', 'phone_number', 'email', 'description', 'no_rccm', 'no_dni', 'sigle'] },
        { model: Employe, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'matricule', 'no_immatriculation', 'date_of_birth', 'date_first_embauche', 'worked_date', 'adress'] },
        { model: PrestationDocument, as: 'documents' }
      ]
    });
    const dJson = withDocs.toJSON ? withDocs.toJSON() : withDocs;
    const emp = dJson.employee;
    const employeur = dJson.employeur;
    const employment = dJson.employment || {};
    const docs = (dJson.documents || []).map(doc => ({
      id: String(doc.id),
      document_type_id: doc.document_type_id,
      name: doc.name,
      type: doc.mime_type || 'application/pdf',
      size: doc.size || 0,
      url: doc.path ? '/' + doc.path.replace(/^\/+/, '') : null,
      uploaded_at: doc.createdAt,
      required: doc.required !== false,
      status: doc.status || 'uploaded'
    }));
    const employerPayload = employeur ? {
      id: String(employeur.id),
      raison_sociale: employeur.raison_sociale || '',
      nif: employeur.no_rccm || employeur.no_dni || '',
      cnss_number: employeur.no_immatriculation || '',
      adresse: employeur.adresse || '',
      address: employeur.adresse || '',
      phone: employeur.phone_number || '',
      phone_number: employeur.phone_number || '',
      email: employeur.email || '',
      contact_rh: employeur.description || employeur.sigle || ''
    } : null;
    return res.status(200).json({
      id: String(d.id),
      dossier_id: d.dossier_id || null,
      employee_id: String(d.employee_id),
      employee_name: emp ? `${(emp.last_name || '').toUpperCase()} ${emp.first_name || ''}`.trim() : '',
      employee_matricule: emp ? (emp.no_immatriculation || emp.matricule || '') : '',
      request_type: d.request_type || 'retraite_normale',
      departure_date: d.departure_date || null,
      motif: d.motif || null,
      observations: d.observations || null,
      status: d.status,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
      submitted_at: d.submitted_at || null,
      employer: employerPayload,
      employee: emp ? { id: String(emp.id), first_name: emp.first_name, last_name: emp.last_name, matricule: emp.matricule, cnss_number: emp.no_immatriculation, birth_date: emp.date_of_birth, hire_date: employment.date_embauche || emp.date_first_embauche || emp.worked_date, end_date: employment.date_debauche, last_salary: employment.dernier_salaire, total_declared_periods: null } : null,
      bank_info: d.bank_info || null,
      children: d.children || [],
      documents: docs
    });
  } catch (err) {
    if (err.name === 'SyntaxError') return res.status(400).json({ message: 'JSON demande invalide' });
    console.error('[PRESTATIONS_PATCH]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * POST /api/v1/prestations/demandes/:id/annuler
 */
router.post('/demandes/:id/annuler', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const d = await PrestationDemande.findOne({ where: { id, employeur_id: employeurId } });
    if (!d) return res.status(404).json({ message: 'Demande non trouvée' });
    if (!['brouillon', 'soumise'].includes(d.status)) {
      return res.status(400).json({ message: 'Seules les demandes en brouillon ou soumise peuvent être annulées' });
    }
    const motif = (req.body && req.body.motif_annulation) || null;
    await d.update({ status: 'cloturee', cancelled_at: new Date(), motif_annulation: motif });
    const withDocs = await PrestationDemande.findByPk(d.id, {
      include: [
        { model: Employe, as: 'employee', attributes: ['id', 'first_name', 'last_name', 'no_immatriculation', 'matricule'] },
        { model: PrestationDocument, as: 'documents' }
      ]
    });
    const dJson = withDocs.toJSON ? withDocs.toJSON() : withDocs;
    return res.status(200).json(formatDemandeItem(dJson, dJson.employee));
  } catch (err) {
    console.error('[PRESTATIONS_ANNULER]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * GET /api/v1/prestations/pieces-requises
 */
router.get('/pieces-requises', EmployeurToken, (req, res) => {
  return res.status(200).json({ data: PIECES_REQUISES });
});

/**
 * GET /api/v1/prestations/aide
 */
router.get('/aide', EmployeurToken, (req, res) => {
  return res.status(200).json(AIDE);
});

/**
 * GET /api/v1/prestations/demandes/:id/accuse
 * Optionnel: retourne un PDF accusé de réception (non implémenté = 501)
 */
router.get('/demandes/:id/accuse', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const d = await PrestationDemande.findOne({ where: { id, employeur_id: employeurId } });
    if (!d) return res.status(404).json({ message: 'Demande non trouvée' });
    if (!d.dossier_id) return res.status(400).json({ message: 'Aucun accusé pour un brouillon' });
    return res.status(501).json({ message: 'Génération PDF accusé non implémentée' });
  } catch (err) {
    console.error('[PRESTATIONS_ACCUSE]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
