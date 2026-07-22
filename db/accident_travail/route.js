const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Op } = require('sequelize');
const sequelize = require('../db.connection');
const AccidentTravail = require('./model');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');
const { EmployeurToken, generateUniqueCode } = require('../users/utility');
const { generateAccidentTravailModel } = require('./pdf');

let sendMailAccidentTravailReceived;
try {
  sendMailAccidentTravailReceived = require('../../utility2').sendMailAccidentTravailReceived;
} catch {
  sendMailAccidentTravailReceived = async () => {};
}

const STATUSES = AccidentTravail.ACCIDENT_TRAVAIL_STATUSES;

const uploadDir = path.join(__dirname, '../../uploads/accident_travail');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.pdf').toLowerCase();
    const name = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').substring(0, 40);
    cb(null, `eadt-${Date.now()}-${name}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }
});

async function getNextReference(employeurId) {
  const year = new Date().getFullYear();
  const prefix = `EADT-${year}-`;
  const last = await AccidentTravail.findOne({
    where: { reference: { [Op.like]: `${prefix}%` }, employeur_id: employeurId },
    order: [['id', 'DESC']],
    attributes: ['reference']
  });
  const lastNum = last && last.reference
    ? parseInt(last.reference.replace(prefix, ''), 10) || 0
    : 0;
  return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
}

function formatItem(d) {
  const dJson = d.toJSON ? d.toJSON() : d;
  const employe = dJson.employe || null;
  return {
    id: String(dJson.id),
    reference: dJson.reference || '',
    employe_id: dJson.employe_id,
    employe: employe ? {
      id: employe.id,
      nom: [employe.last_name, employe.first_name].filter(Boolean).join(' '),
      matricule: employe.matricule || '',
      no_immatriculation: employe.no_immatriculation || ''
    } : null,
    status: dJson.status || 'pending',
    date_sent: dJson.createdAt ? (typeof dJson.createdAt === 'string' ? dJson.createdAt : dJson.createdAt.toISOString()).slice(0, 10) : null,
    date_response: dJson.date_response ? (typeof dJson.date_response === 'string' ? dJson.date_response : dJson.date_response.toISOString()).slice(0, 10) : null,
    modele_url: dJson.modele_path ? `/api/v1/accident_travail/demandes/${dJson.id}/modele` : null,
    document_url: dJson.document_path ? `/api/v1/accident_travail/demandes/${dJson.id}/document` : null
  };
}

// GET /api/v1/accident_travail/stats
router.get('/stats', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const [total, pending, received, documentsSubmitted, rejected] = await Promise.all([
      AccidentTravail.count({ where: { employeur_id: employeurId } }),
      AccidentTravail.count({ where: { employeur_id: employeurId, status: 'pending' } }),
      AccidentTravail.count({ where: { employeur_id: employeurId, status: 'received' } }),
      AccidentTravail.count({ where: { employeur_id: employeurId, status: 'documents_submitted' } }),
      AccidentTravail.count({ where: { employeur_id: employeurId, status: 'rejected' } })
    ]);
    res.json({ total, pending, received, documents_submitted: documentsSubmitted, rejected });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/accident_travail/demandes
router.get('/demandes', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const recherche = (req.query.recherche || '').trim();
    const statut = req.query.statut;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));

    const where = { employeur_id: employeurId };
    if (statut && STATUSES.includes(statut)) where.status = statut;
    if (recherche) {
      where.reference = { [Op.like]: `%${recherche}%` };
    }

    const { count, rows } = await AccidentTravail.findAndCountAll({
      where,
      include: [{ model: Employe, as: 'employe', attributes: ['id', 'first_name', 'last_name', 'matricule', 'no_immatriculation'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit
    });

    res.json({
      data: rows.map((d) => formatItem(d)),
      pagination: { page, limit, total: count }
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/accident_travail/demandes/:id
router.get('/demandes/:id', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const d = await AccidentTravail.findOne({
      where: { id, employeur_id: employeurId },
      include: [{ model: Employe, as: 'employe', attributes: ['id', 'first_name', 'last_name', 'matricule', 'no_immatriculation'] }]
    });
    if (!d) return res.status(404).json({ message: 'Déclaration introuvable' });
    res.json(formatItem(d));
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// POST /api/v1/accident_travail/generate_model — génère le modèle PDF pré-rempli (téléchargement, pas de persistance)
router.post('/generate_model', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const body = req.body || {};
    if (!body.employe_id) return res.status(400).json({ message: 'Employé requis' });

    const employeId = parseInt(body.employe_id, 10);
    const employe = await Employe.findOne({ where: { id: employeId, employeurId } });
    if (!employe) return res.status(404).json({ message: 'Employé introuvable' });

    const employeur = await Employeur.findByPk(employeurId);
    const fileName = `Modele-EADT-${employeurId}-${employeId}-${generateUniqueCode(9)}`;

    const pdfResult = await generateAccidentTravailModel(fileName, employeur, employe);

    res.status(200).json({
      fileName: `${fileName}.pdf`,
      pdfBase64: pdfResult.buffer.toString('base64')
    });
  } catch (err) {
    console.error('[ACCIDENT_TRAVAIL_GENERATE_MODEL]', err);
    res.status(400).json({ message: 'Modèle non généré, veuillez réessayer plus tard' });
  }
});

// Middleware: run multer only for multipart
const maybeUpload = (req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    return upload.single('document_signe')(req, res, next);
  }
  next();
};

// POST /api/v1/accident_travail/demandes — multipart obligatoire (employe_id + document rempli/signé/cacheté)
router.post('/demandes', EmployeurToken, maybeUpload, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const employeurId = req.user.user_id;
    let body = req.body || {};
    if (typeof body.demande === 'string') {
      try { body = { ...body, ...JSON.parse(body.demande) }; } catch (_) {}
    }
    if (!body.employe_id) {
      await t.rollback();
      return res.status(400).json({ message: 'Employé requis' });
    }
    if (!req.file || !req.file.filename) {
      await t.rollback();
      return res.status(400).json({ message: 'Veuillez soumettre le document rempli, signé et cacheté' });
    }

    const employeId = parseInt(body.employe_id, 10);
    const employe = await Employe.findOne({ where: { id: employeId, employeurId } });
    if (!employe) {
      await t.rollback();
      return res.status(404).json({ message: 'Employé introuvable' });
    }

    const reference = await getNextReference(employeurId);
    const created = await AccidentTravail.create({
      employeur_id: employeurId,
      employe_id: employeId,
      reference,
      status: 'pending',
      document_path: req.file.filename
    }, { transaction: t });

    await t.commit();

    const full = await AccidentTravail.findOne({
      where: { id: created.id },
      include: [{ model: Employe, as: 'employe', attributes: ['id', 'first_name', 'last_name', 'matricule', 'no_immatriculation'] }]
    });
    res.status(201).json(formatItem(full));
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error('[ACCIDENT_TRAVAIL_CREATE]', err);
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/accident_travail/demandes/:id/document — document rempli/signé/cacheté uploadé
router.get('/demandes/:id/document', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const d = await AccidentTravail.findOne({ where: { id, employeur_id: employeurId }, attributes: ['id', 'document_path', 'reference'] });
    if (!d || !d.document_path) return res.status(404).json({ message: 'Document non disponible' });
    const fullPath = path.join(uploadDir, path.basename(d.document_path));
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'Document non disponible' });
    const filename = (d.reference || `EADT-${id}`) + path.extname(fullPath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(fullPath);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/accident_travail/demandes/:id/modele — PDF modèle généré à la soumission
router.get('/demandes/:id/modele', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const d = await AccidentTravail.findOne({ where: { id, employeur_id: employeurId }, attributes: ['id', 'modele_path', 'reference'] });
    if (!d || !d.modele_path) return res.status(404).json({ message: 'Modèle non disponible' });
    const docsDir = path.join(__dirname, '../../document/docs');
    const fullPath = path.join(docsDir, path.basename(d.modele_path));
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'Modèle non disponible' });
    const filename = (d.reference || `EADT-${id}`) + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(fullPath);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// ============================================================
// Documents complémentaires (lien reçu par email après "Demande reçue")
// ============================================================

const uploadComplementaires = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 4 }
});

function formatUuidItem(d) {
  const dJson = d.toJSON ? d.toJSON() : d;
  const employe = dJson.employe || null;
  return {
    id: String(dJson.id),
    uuid: dJson.uuid,
    reference: dJson.reference || '',
    status: dJson.status || 'pending',
    employe: employe ? {
      nom: [employe.last_name, employe.first_name].filter(Boolean).join(' '),
      matricule: employe.matricule || ''
    } : null,
    documents_complementaires: Array.isArray(dJson.documents_complementaires) ? dJson.documents_complementaires : []
  };
}

// GET /api/v1/accident_travail/documents/:uuid — détail pour la page de soumission (login requis, propriétaire uniquement)
router.get('/documents/:uuid', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const d = await AccidentTravail.findOne({
      where: { uuid: req.params.uuid, employeur_id: employeurId },
      include: [{ model: Employe, as: 'employe', attributes: ['id', 'first_name', 'last_name', 'matricule'] }]
    });
    if (!d) return res.status(404).json({ message: 'Déclaration introuvable' });
    res.json(formatUuidItem(d));
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// POST /api/v1/accident_travail/documents/:uuid — soumission des documents complémentaires (max 4 fichiers)
router.post('/documents/:uuid', EmployeurToken, uploadComplementaires.array('documents', 4), async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const d = await AccidentTravail.findOne({ where: { uuid: req.params.uuid, employeur_id: employeurId } });
    if (!d) return res.status(404).json({ message: 'Déclaration introuvable' });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Veuillez joindre au moins un document' });
    }
    if (req.files.length > 4) {
      return res.status(400).json({ message: '4 documents maximum' });
    }

    const documents = req.files.map((f) => ({ path: f.filename, name: f.originalname || f.filename }));

    await d.update({
      documents_complementaires: documents,
      status: 'documents_submitted',
      date_response: new Date()
    });

    const full = await AccidentTravail.findOne({
      where: { id: d.id },
      include: [{ model: Employe, as: 'employe', attributes: ['id', 'first_name', 'last_name', 'matricule'] }]
    });
    res.status(200).json(formatUuidItem(full));
  } catch (err) {
    console.error('[ACCIDENT_TRAVAIL_DOCUMENTS_UUID]', err);
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// ============================================================
// BO ROUTES — sans filtre employeur_id
// ============================================================

function formatBoItem(d) {
  const dJson = d.toJSON ? d.toJSON() : d;
  const employe = dJson.employe || null;
  const employeur = dJson.employeur || null;
  return {
    id: String(dJson.id),
    reference: dJson.reference || '',
    status: dJson.status || 'pending',
    date_sent: dJson.createdAt ? (typeof dJson.createdAt === 'string' ? dJson.createdAt : dJson.createdAt.toISOString()).slice(0, 10) : null,
    date_response: dJson.date_response ? (typeof dJson.date_response === 'string' ? dJson.date_response : dJson.date_response.toISOString()).slice(0, 10) : null,
    employeur: employeur ? {
      id: employeur.id,
      raison_sociale: employeur.raison_sociale || '',
      no_immatriculation: employeur.no_immatriculation || null,
      email: employeur.email || null,
      phone_number: employeur.phone_number || null
    } : null,
    employe: employe ? {
      id: employe.id,
      nom: [employe.last_name, employe.first_name].filter(Boolean).join(' '),
      matricule: employe.matricule || '',
      no_immatriculation: employe.no_immatriculation || ''
    } : null,
    document_url: dJson.document_path ? `/uploads/accident_travail/${path.basename(dJson.document_path)}` : null,
    documents_complementaires: Array.isArray(dJson.documents_complementaires)
      ? dJson.documents_complementaires.map((doc) => ({
          name: doc.name,
          url: `/uploads/accident_travail/${path.basename(doc.path)}`
        }))
      : []
  };
}

// GET /bo/stats
router.get('/bo/stats', async (req, res) => {
  try {
    const [total, pending, received, documentsSubmitted, rejected] = await Promise.all([
      AccidentTravail.count(),
      AccidentTravail.count({ where: { status: 'pending' } }),
      AccidentTravail.count({ where: { status: 'received' } }),
      AccidentTravail.count({ where: { status: 'documents_submitted' } }),
      AccidentTravail.count({ where: { status: 'rejected' } })
    ]);
    return res.status(200).json({ success: true, data: { total, pending, received, documents_submitted: documentsSubmitted, rejected } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /bo/demandes
router.get('/bo/demandes', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 15);
    const offset = (page - 1) * limit;
    const { recherche, statut } = req.query;

    const where = {};
    if (statut && STATUSES.includes(statut)) where.status = statut;
    if (recherche && recherche.trim()) {
      where.reference = { [Op.like]: `%${recherche.trim()}%` };
    }

    const { count, rows } = await AccidentTravail.findAndCountAll({
      where,
      include: [
        { model: Employeur, as: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation', 'email', 'phone_number'] },
        { model: Employe, as: 'employe', attributes: ['id', 'first_name', 'last_name', 'matricule', 'no_immatriculation'] }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json({
      success: true,
      data: rows.map((d) => formatBoItem(d)),
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /bo/demandes/:id
router.get('/bo/demandes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'ID invalide' });
    const d = await AccidentTravail.findByPk(id, {
      include: [
        { model: Employeur, as: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation', 'email', 'phone_number', 'adresse'] },
        { model: Employe, as: 'employe', attributes: ['id', 'first_name', 'last_name', 'matricule', 'no_immatriculation'] }
      ]
    });
    if (!d) return res.status(404).json({ success: false, message: 'Déclaration introuvable' });
    return res.status(200).json({ success: true, data: formatBoItem(d) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /bo/demandes/:id/statut
router.put('/bo/demandes/:id/statut', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'ID invalide' });
    const d = await AccidentTravail.findByPk(id, {
      include: [{ model: Employeur, as: 'employeur', attributes: ['id', 'raison_sociale', 'email'] }]
    });
    if (!d) return res.status(404).json({ success: false, message: 'Déclaration introuvable' });

    const { statut } = req.body;
    if (!statut || !STATUSES.includes(statut)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }

    await d.update({
      status: statut,
      date_response: statut === 'rejected' ? new Date() : d.date_response
    });

    // "Demande reçue" : notifie l'employeur par email avec le lien de soumission des documents complémentaires
    if (statut === 'received' && d.employeur && d.employeur.email) {
      console.log('[ACCIDENT_TRAVAIL_STATUT] tentative envoi email vers:', d.employeur.email);
      sendMailAccidentTravailReceived(d.employeur.email, d.employeur, d)
        .then((ok) => console.log('[ACCIDENT_TRAVAIL_STATUT] résultat envoi email pour', d.employeur.email, '->', ok))
        .catch((err) => console.error('[ACCIDENT_TRAVAIL_STATUT] Erreur envoi email:', err.message));
    } else if (statut === 'received') {
      console.warn('[ACCIDENT_TRAVAIL_STATUT] pas d\'email employeur — notification non envoyée. employeur:', d.employeur?.id, '| email:', d.employeur?.email);
    }

    return res.status(200).json({ success: true, data: d });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
