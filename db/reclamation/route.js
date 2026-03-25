const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Op } = require('sequelize');
const ReclamationDemande = require('./model');
const Employeur = require('../XYemployeurs/model');
const CotisationEmployeur = require('../cotisation_employeur/model');
const Paiement = require('../paiement/model');
const Document = require('../document/model');
const Quittance = require('../quittance/model');
const { EmployeurToken } = require('../users/utility');
const cotisationUtil = require('../cotisation_employeur/utility');

let genereQuittance, sendMailSuccesfulPaiement;
try {
  const u2 = require('../../utility2');
  genereQuittance = u2.genereQuittance || (() => Promise.resolve());
  sendMailSuccesfulPaiement = u2.sendMailSuccesfulPaiement || (() => Promise.resolve());
} catch {
  genereQuittance = () => Promise.resolve();
  sendMailSuccesfulPaiement = () => Promise.resolve();
}

const RECLAMATION_TYPES = ReclamationDemande.RECLAMATION_TYPES;
const RECLAMATION_STATUSES = ReclamationDemande.RECLAMATION_STATUSES;

const reclamationUploadDir = path.join(__dirname, '../../uploads/reclamations');
if (!fs.existsSync(reclamationUploadDir)) {
  fs.mkdirSync(reclamationUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, reclamationUploadDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.pdf').toLowerCase();
    const name = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').substring(0, 40);
    cb(null, `rec-${Date.now()}-${name}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 10 } // 15 MB par fichier
});

function getMonthByCode(code) {
  return (cotisationUtil.MONTHS || []).find((m) => m.code === code);
}

function formatItem(d, baseUrl = '') {
  const dateSent = d.createdAt ? (typeof d.createdAt === 'string' ? d.createdAt : d.createdAt.toISOString()).slice(0, 10) : null;
  const dateResponse = d.date_response ? (typeof d.date_response === 'string' ? d.date_response : d.date_response.toISOString()).slice(0, 10) : null;
  const docUrl = d.document_path
    ? (baseUrl ? `${baseUrl}/demandes/${d.id}/document` : `/api/v1/reclamation/demandes/${d.id}/document`)
    : undefined;
  let periodeLabel = null;
  if (d.mois && d.annee) {
    const monthInfo = getMonthByCode(String(d.mois).padStart(2, '0'));
    const label = monthInfo ? (monthInfo.name.includes('e MOIS') ? monthInfo.name : monthInfo.name.charAt(0) + monthInfo.name.slice(1).toLowerCase()) : d.mois;
    periodeLabel = `${label} ${d.annee}`;
  }
  return {
    id: String(d.id),
    reference: d.reference || '',
    type: d.type || '',
    libelle: d.libelle || '',
    date_sent: dateSent,
    date_response: dateResponse,
    status: d.status || 'pending',
    progress: d.progress != null ? Number(d.progress) : 0,
    ...(periodeLabel && { periode: periodeLabel }),
    ...(docUrl && { document_url: docUrl })
  };
}

async function getNextReference(employeurId) {
  const year = new Date().getFullYear();
  const prefix = `REC-${year}-`;
  const last = await ReclamationDemande.findOne({
    where: { reference: { [Op.like]: `${prefix}%` }, employeur_id: employeurId },
    order: [['id', 'DESC']],
    attributes: ['reference']
  });
  const lastNum = last && last.reference
    ? parseInt(last.reference.replace(prefix, ''), 10) || 0
    : 0;
  return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
}

function defaultLibelle(type) {
  const map = {
    quittance: "Demande de Quittance de Paiement",
    notification: "Notification d'Affiliation",
    facture: "Facture de déclaration",
    certificat: "Certificat d'immatriculation",
    annulation: "Annulation déclaration",
    rectification: "Rectification déclaration",
    correction_naissance: "Correction date naissance",
    correction_genre: "Correction de genre",
    autre: "Autre réclamation"
  };
  return map[type] || `Réclamation ${type}`;
}

// GET /api/v1/reclamation/stats
router.get('/stats', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const [total, approved, processing, rejected] = await Promise.all([
      ReclamationDemande.count({ where: { employeur_id: employeurId } }),
      ReclamationDemande.count({ where: { employeur_id: employeurId, status: 'approved' } }),
      ReclamationDemande.count({ where: { employeur_id: employeurId, status: 'processing' } }),
      ReclamationDemande.count({ where: { employeur_id: employeurId, status: 'rejected' } })
    ]);
    res.json({ total, approved, processing, rejected });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/reclamation/stats/evolution
router.get('/stats/evolution', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const annee = parseInt(req.query.annee, 10) || new Date().getFullYear();
    const nbMois = Math.min(parseInt(req.query.nb_mois, 10) || 6, 12);
    const startMonth = new Date(annee, 0, 1);
    const endDate = new Date(annee, nbMois, 0);
    const demandes = await ReclamationDemande.findAll({
      where: {
        employeur_id: employeurId,
        createdAt: { [Op.gte]: startMonth, [Op.lte]: endDate }
      },
      attributes: ['id', 'createdAt']
    });
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const byMonth = {};
    for (let i = 0; i < nbMois; i++) {
      const d = new Date(annee, i, 1);
      byMonth[i] = { name: monthNames[d.getMonth()], demandes: 0 };
    }
    demandes.forEach((d) => {
      const m = new Date(d.createdAt).getMonth();
      if (byMonth[m]) byMonth[m].demandes += 1;
    });
    res.json({
      data: Object.keys(byMonth)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => byMonth[k])
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/reclamation/stats/repartition
router.get('/stats/repartition', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const counts = await ReclamationDemande.findAll({
      where: { employeur_id: employeurId },
      attributes: ['status'],
      raw: true
    });
    const map = { approved: { name: 'Approuvées', value: 0, color: '#3AAA35' }, processing: { name: 'En cours', value: 0, color: '#0EA5E9' }, pending: { name: 'En attente', value: 0, color: '#FFED00' }, rejected: { name: 'Rejetées', value: 0, color: '#E30613' } };
    counts.forEach((c) => {
      if (map[c.status]) map[c.status].value += 1;
    });
    res.json({
      data: Object.values(map)
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/reclamation/demandes
router.get('/demandes', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const recherche = (req.query.recherche || '').trim();
    const type = req.query.type;
    const statut = req.query.statut;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 5));

    const where = { employeur_id: employeurId };
    if (type && RECLAMATION_TYPES.includes(type)) where.type = type;
    if (statut && RECLAMATION_STATUSES.includes(statut)) where.status = statut;
    if (recherche) {
      where[Op.or] = [
        { reference: { [Op.like]: `%${recherche}%` } },
        { libelle: { [Op.like]: `%${recherche}%` } }
      ];
    }

    const { count, rows } = await ReclamationDemande.findAndCountAll({
      where,
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

// GET /api/v1/reclamation/demandes/:id
router.get('/demandes/:id', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const d = await ReclamationDemande.findOne({
      where: { id, employeur_id: employeurId },
      include: [
        { model: CotisationEmployeur, as: 'cotisation', attributes: ['id', 'periode', 'year', 'total_cotisation', 'total_branche', 'is_paid'], required: false }
      ]
    });
    if (!d) return res.status(404).json({ message: 'Réclamation introuvable' });
    const dJson = d.toJSON ? d.toJSON() : d;
    res.json({
      ...formatItem(dJson),
      description: dJson.description || null,
      cotisation_employeur_id: dJson.cotisation_employeur_id || null,
      cotisation: dJson.cotisation || null,
      documents_complementaires: dJson.documents_complementaires || null
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// DELETE /api/v1/reclamation/demandes/:id/cotisation
router.delete('/demandes/:id/cotisation', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const demande = await ReclamationDemande.findOne({ where: { id, employeur_id: employeurId } });
    if (!demande) return res.status(404).json({ message: 'Réclamation introuvable' });
    if (!demande.cotisation_employeur_id) return res.status(400).json({ message: 'Aucune déclaration associée à cette réclamation' });
    const cotisation = await CotisationEmployeur.findByPk(demande.cotisation_employeur_id);
    if (!cotisation) return res.status(404).json({ message: 'Déclaration introuvable' });
    if (cotisation.is_paid) return res.status(400).json({ message: 'Impossible de supprimer une déclaration déjà payée' });
    await cotisation.destroy();
    await demande.update({ cotisation_employeur_id: null });
    return res.status(200).json({ success: true, message: 'Déclaration supprimée avec succès' });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// Middleware: run multer only for multipart
const maybeUpload = (req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    return upload.fields([
      { name: 'document_principal', maxCount: 1 },
      { name: 'documents_complementaires', maxCount: 5 }
    ])(req, res, next);
  }
  next();
};

// POST /api/v1/reclamation/demandes (JSON or multipart)
router.post('/demandes', EmployeurToken, maybeUpload, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    let body = req.body || {};
    if (typeof body.demande === 'string') {
      try {
        body = { ...body, ...JSON.parse(body.demande) };
      } catch (_) {}
    }
    const type = (body.type || '').trim();
    if (!RECLAMATION_TYPES.includes(type)) {
      return res.status(400).json({ message: 'Type de réclamation invalide ou manquant' });
    }

    if ((type === 'quittance' || type === 'facture') && !body.periode_verifiee) {
      return res.status(400).json({ message: 'Veuillez vérifier la période de paiement avant de soumettre' });
    }
    if (type === 'quittance' || type === 'facture') {
      if (!body.mois || !body.annee) {
        return res.status(400).json({ message: 'Mois et année requis pour ce type' });
      }
    }
    if (type === 'annulation') {
      if (!body.mois || !body.annee) {
        return res.status(400).json({ message: 'Mois et année requis pour l\'annulation' });
      }
      const annulationDoc = req.files && req.files.document_principal && req.files.document_principal[0];
      if (!annulationDoc || !annulationDoc.filename) {
        return res.status(400).json({ message: 'Le courrier (document justificatif) est obligatoire pour la demande d\'annulation' });
      }
    }
    if (type === 'correction_naissance') {
      if (!body.description || !body.description.trim()) {
        return res.status(400).json({ message: 'Employé requis pour la correction de date de naissance' });
      }
      const mainFile = req.files && req.files.document_principal && req.files.document_principal[0];
      if (!mainFile || !mainFile.filename) {
        return res.status(400).json({ message: 'Extrait de naissance obligatoire' });
      }
    }
    if (type === 'correction_genre') {
      if (!body.description || !body.description.trim()) {
        return res.status(400).json({ message: 'Employé et genre requis pour la correction de genre' });
      }
      const genreDoc = req.files && req.files.document_principal && req.files.document_principal[0];
      if (!genreDoc || !genreDoc.filename) {
        return res.status(400).json({ message: 'Extrait de naissance obligatoire pour la correction de genre' });
      }
    }

    const reference = await getNextReference(employeurId);
    let libelle = body.libelle || defaultLibelle(type);
    if (type === 'annulation' && body.mois && body.annee) {
      const monthInfo = getMonthByCode(String(body.mois).padStart(2, '0'));
      const label = monthInfo ? (monthInfo.name.includes('e MOIS') ? monthInfo.name : monthInfo.name.charAt(0) + monthInfo.name.slice(1).toLowerCase()) : body.mois;
      libelle = `Annulation déclaration - ${label} ${body.annee}`;
    }

    const payload = {
      employeur_id: employeurId,
      reference,
      type,
      libelle,
      status: 'pending',
      progress: 0,
      mois: (type === 'quittance' || type === 'facture' || type === 'annulation') ? (body.mois || null) : null,
      annee: (type === 'quittance' || type === 'facture' || type === 'annulation') ? (body.annee || null) : null,
      periode_verifiee: type === 'quittance' || type === 'facture' ? !!body.periode_verifiee : null,
      description: (type === 'autre' || type === 'correction_naissance' || type === 'correction_genre') ? (body.description || null) : null,
      cotisation_employeur_id: (type === 'annulation' || type === 'quittance' || type === 'facture') && body.cotisation_employeur_id ? parseInt(body.cotisation_employeur_id, 10) || null : null
    };

    const mainFile = req.files && req.files.document_principal && req.files.document_principal[0];
    const compFiles = req.files && req.files.documents_complementaires;
    if (mainFile && mainFile.filename) payload.document_path = mainFile.filename;
    if (compFiles && compFiles.length) {
      payload.documents_complementaires = compFiles.map((f) => ({ path: f.filename, name: f.originalname || f.filename }));
    }

    const created = await ReclamationDemande.create(payload);
    const item = formatItem(created);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// POST /api/v1/reclamation/verifier-paiement
router.post('/verifier-paiement', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const { mois, annee } = req.body || {};
    if (!mois || !annee) {
      return res.status(400).json({ message: 'mois et annee requis' });
    }
    const year = parseInt(annee, 10);
    if (isNaN(year)) return res.status(400).json({ message: 'annee invalide' });

    const monthInfo = getMonthByCode(String(mois).padStart(2, '0'));
    const periodeName = monthInfo ? monthInfo.name : null;
    if (!periodeName) {
      return res.status(404).json({ message: 'Aucun paiement trouvé pour cette période' });
    }

    const cotisation = await CotisationEmployeur.findOne({
      where: { employeurId: employeurId, year, periode: periodeName },
      include: [{ model: Paiement, as: 'paiements', required: false }]
    });

    if (!cotisation) {
      return res.status(404).json({ message: 'Aucun paiement trouvé pour cette période' });
    }

    const paid = cotisation.is_paid === true;
    const totalCotisations = Number(cotisation.total_branche || cotisation.total_cotisation || 0);
    const paidP = (cotisation.paiements || [])[0];
    const montantPaye = paid ? totalCotisations : 0;
    const datePaiement = cotisation.paid_date || (paidP && paidP.paid_date) ? (cotisation.paid_date || paidP.paid_date) : null;
    const refP = paidP && (paidP.merchantReference || paidP.invoiceId) ? (paidP.merchantReference || paidP.invoiceId) : null;
    const reference = refP || `PAY-${annee}-${String(mois).padStart(2, '0')}-${cotisation.id}`;
    let statut = 'impayé';
    if (paid && montantPaye >= totalCotisations) statut = 'payé';
    else if (paid && montantPaye > 0) statut = 'partiel';

    const labelMonth = periodeName.includes('e MOIS')
      ? periodeName
      : periodeName.charAt(0) + periodeName.slice(1).toLowerCase();
    const periode = `${labelMonth} ${annee}`;

    res.json({
      cotisation_id: cotisation.id,
      periode,
      montant_cotisations: totalCotisations,
      montant_paye: montantPaye,
      date_paiement: datePaiement ? (typeof datePaiement === 'string' ? datePaiement : datePaiement.toISOString()).slice(0, 10) : null,
      reference,
      statut,
      banque: paidP && paidP.bank_name ? { nom: paidP.bank_name, code: (paidP.bank_name || '').slice(0, 4).toUpperCase() } : { nom: '-', code: '-' },
      nombre_employes: cotisation.current_effectif != null ? cotisation.current_effectif : 0
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/reclamation/demandes/:id/document
router.get('/demandes/:id/document', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const d = await ReclamationDemande.findOne({
      where: { id, employeur_id: employeurId },
      attributes: ['id', 'document_path', 'reference']
    });
    if (!d) return res.status(404).json({ message: 'Réclamation introuvable' });
    if (!d.document_path) return res.status(404).json({ message: 'Document non disponible' });

    const fullPath = path.isAbsolute(d.document_path) ? d.document_path : path.join(reclamationUploadDir, path.basename(d.document_path || ''));
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'Document non disponible' });

    const filename = (d.reference || `REC-${id}`) + path.extname(fullPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(fullPath);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// ============================================================
// BO ROUTES — sans filtre employeur_id
// ============================================================

// GET /bo/stats
router.get('/bo/stats', async (req, res) => {
  try {
    const [total, pending, approved, processing, rejected] = await Promise.all([
      ReclamationDemande.count(),
      ReclamationDemande.count({ where: { status: 'pending' } }),
      ReclamationDemande.count({ where: { status: 'approved' } }),
      ReclamationDemande.count({ where: { status: 'processing' } }),
      ReclamationDemande.count({ where: { status: 'rejected' } }),
    ]);
    return res.status(200).json({ success: true, data: { total, pending, approved, processing, rejected } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /bo/demandes
router.get('/bo/demandes', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 15);
    const offset = (page - 1) * limit;
    const { recherche, type, statut } = req.query;

    const where = {};
    if (type && RECLAMATION_TYPES.includes(type)) where.type = type;
    if (statut && RECLAMATION_STATUSES.includes(statut)) where.status = statut;
    if (recherche && recherche.trim()) {
      where[Op.or] = [
        { reference: { [Op.like]: `%${recherche.trim()}%` } },
        { libelle: { [Op.like]: `%${recherche.trim()}%` } },
      ];
    }

    const { count, rows } = await ReclamationDemande.findAndCountAll({
      where,
      include: [{ model: Employeur, as: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation', 'email', 'phone_number'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      data: rows.map((d) => ({ ...formatItem(d), employeur: (d.toJSON ? d.toJSON() : d).employeur || null })),
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
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
    const CotisationEmployeur = require('../cotisation_employeur/model');
    const d = await ReclamationDemande.findByPk(id, {
      include: [
        { model: Employeur, as: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation', 'email', 'phone_number', 'adresse'] },
        { model: CotisationEmployeur, as: 'cotisation', attributes: ['id', 'periode', 'year', 'total_cotisation', 'total_branche', 'is_paid'], required: false },
      ],
    });
    if (!d) return res.status(404).json({ success: false, message: 'Réclamation introuvable' });
    const dJson = d.toJSON ? d.toJSON() : d;
    return res.status(200).json({ success: true, data: { ...formatItem(dJson), employeur: dJson.employeur, description: dJson.description, documents_complementaires: dJson.documents_complementaires, cotisation_employeur_id: dJson.cotisation_employeur_id, cotisation: dJson.cotisation || null } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /bo/demandes/:id/approuver-quittance
router.put('/bo/demandes/:id/approuver-quittance', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'ID invalide' });

    const d = await ReclamationDemande.findByPk(id, {
      include: [
        { model: Employeur, as: 'employeur', required: true },
        { model: CotisationEmployeur, as: 'cotisation', required: false },
      ],
    });
    if (!d) return res.status(404).json({ success: false, message: 'Réclamation introuvable' });
    if (d.type !== 'quittance') return res.status(400).json({ success: false, message: 'Cette action n\'est applicable qu\'aux demandes de type quittance' });

    // 1) Vérifier que la cotisation est payée
    if (!d.cotisation || !d.cotisation.is_paid) {
      return res.status(400).json({ success: false, message: 'La cotisation associée n\'est pas encore payée' });
    }

    const cotisation = d.cotisation;
    const employeur = d.employeur;

    // 2) Construire les infos de période
    const MONTHS_LIST = cotisationUtil.MONTHS || [];
    const monthInfo = MONTHS_LIST.find((m) => m.name === cotisation.periode || m.code === String(d.mois).padStart(2, '0'));
    const code = monthInfo ? monthInfo.code : String(d.mois || '01').padStart(2, '0');
    const year = cotisation.year || d.annee;
    const periodeQuittance = `${code}${year}`;
    const periodeLabel = monthInfo
      ? (monthInfo.name.includes('e MOIS') ? monthInfo.name : monthInfo.name.charAt(0) + monthInfo.name.slice(1).toLowerCase())
      : cotisation.periode || d.mois;
    const periodeReadable = `${periodeLabel} ${year}`;

    // 3) Générer le PDF de la quittance
    const codeUnique = Math.random().toString(36).substr(2, 9).toUpperCase();
    const fileName = `Quittance-rec-${employeur.no_immatriculation}-${periodeQuittance}-${codeUnique}`;

    // Objet paiement factice pour genereQuittance (compatible avec utility2.genereQuittance)
    const fakePaiement = {
      employeur: employeur,
      Employeur: employeur,
      cotisation_employeur: cotisation,
      cotisationEmployeur: cotisation,
      paiement_date: cotisation.paid_date || new Date(),
      bank_name: '-',
    };

    try {
      await genereQuittance(fakePaiement, periodeQuittance, fileName, codeUnique, periodeReadable, '01', '-');
    } catch (pdfErr) {
      console.error('[RECLAMATION_APPROUVER_QUITTANCE] Erreur génération PDF:', pdfErr.message);
      // On continue même si le PDF échoue — le statut sera quand même mis à jour
    }

    const docPath = `/api/v1/docsx/${fileName}.pdf`;

    // 4) Sauvegarder dans document
    await Document.create({
      name: `Quittance-${periodeReadable}`,
      path: docPath,
      code: codeUnique,
      employeurId: employeur.id,
    });

    // 5) Créer l'entrée Quittance
    const reference = `${employeur.no_immatriculation || ''}${periodeQuittance}REC`;
    await Quittance.create({
      reference,
      secret_code: codeUnique,
      doc_path: docPath,
      employeurId: employeur.id,
      cotisation_employeurId: cotisation.id,
      paiementId: null,
    }).catch((e) => console.warn('[RECLAMATION_APPROUVER_QUITTANCE] Quittance create warning:', e.message));

    // 6) Envoyer l'email
    try {
      await sendMailSuccesfulPaiement(fakePaiement, periodeReadable, fileName);
    } catch (mailErr) {
      console.error('[RECLAMATION_APPROUVER_QUITTANCE] Erreur mail:', mailErr.message);
    }

    // 7) Mettre à jour le statut
    await d.update({ status: 'approved', progress: 100, date_response: new Date() });

    return res.status(200).json({ success: true, data: d, quittance_path: docPath });
  } catch (err) {
    console.error('[RECLAMATION_APPROUVER_QUITTANCE]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /bo/demandes/:id/statut
router.put('/bo/demandes/:id/statut', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'ID invalide' });
    const d = await ReclamationDemande.findByPk(id);
    if (!d) return res.status(404).json({ success: false, message: 'Réclamation introuvable' });

    const { statut } = req.body;
    if (!statut || !RECLAMATION_STATUSES.includes(statut)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }

    const progressMap = { pending: 0, processing: 50, approved: 100, rejected: 0 };
    await d.update({
      status: statut,
      progress: progressMap[statut] ?? d.progress,
      date_response: ['approved', 'rejected'].includes(statut) ? new Date() : d.date_response,
    });

    return res.status(200).json({ success: true, data: d });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.upload = upload;
module.exports.reclamationUploadDir = reclamationUploadDir;
