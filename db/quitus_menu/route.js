const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Op } = require('sequelize');
const QuitusDemande = require('./model');
const Employeur = require('../XYemployeurs/model');
const CotisationEmployeur = require('../cotisation_employeur/model');
const Quittance = require('../quittance/model');
const Paiement = require('../paiement/model');
const Demploye = require('../declaration-employe/model');
const Employe = require('../employe/model');
const Demande = require('../demandes/model');
const { EmployeurToken } = require('../users/utility');
const cotisationUtil = require('../cotisation_employeur/utility');

const ROOT_DIR = path.resolve(__dirname, '../..');
const docPath = path.join(ROOT_DIR, 'document', 'docs');
// Même approche que employe : uploads direct (sans sous-dossier quitus)
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.pdf').toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const prefix = file.fieldname === 'document_rccm' ? 'quitus-rccm' : file.fieldname === 'document_nif' ? 'quitus-nif' : 'quitus';
    cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024, files: 5 } }); // 15 MB par fichier

function getMonthByCode(code) {
  return (cotisationUtil.MONTHS || []).find((m) => m.code === code);
}

function formatPeriode(periodeName, annee) {
  if (!periodeName) return '';
  const label = periodeName.includes('e MOIS')
    ? periodeName
    : periodeName.charAt(0) + periodeName.slice(1).toLowerCase();
  return `${label} ${annee}`;
}

function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function getNextReference(employeurId) {
  const year = new Date().getFullYear();
  const prefix = `QUI-${year}-`;
  const last = await QuitusDemande.findOne({
    where: { reference: { [Op.like]: `${prefix}%` }, employeur_id: employeurId },
    order: [['id', 'DESC']],
    attributes: ['reference']
  });
  const lastNum = last && last.reference
    ? parseInt(last.reference.replace(prefix, ''), 10) || 0
    : 0;
  return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
}

// GET /api/v1/quitus/stats
router.get('/stats', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const [total, en_cours, validees] = await Promise.all([
      QuitusDemande.count({ where: { employeur_id: employeurId } }),
      QuitusDemande.count({ where: { employeur_id: employeurId, statut: 'en_cours' } }),
      QuitusDemande.count({ where: { employeur_id: employeurId, statut: 'valide' } })
    ]);
    res.json({ total, en_cours, validees });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/quitus/derniere-declaration — renvoie la dernière déclaration déjà payée
router.get('/derniere-declaration', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const mois = req.query.mois;
    const annee = req.query.annee;

    const where = { employeurId, is_paid: true };
    if (mois && annee) {
      const monthInfo = getMonthByCode(String(mois).padStart(2, '0'));
      if (monthInfo) where.periode = monthInfo.name;
      where.year = parseInt(annee, 10);
    }

    const cotisation = await CotisationEmployeur.findOne({
      where,
      order: [['paid_date', 'DESC'], ['createdAt', 'DESC']],
      include: [{ model: Demploye, as: 'declarations_employes', include: [{ model: Employe, as: 'employe', attributes: ['id', 'first_name', 'last_name', 'matricule', 'no_immatriculation', 'fonction'] }] }]
    });

    if (!cotisation) {
      return res.status(404).json({ message: 'Aucune déclaration payée disponible' });
    }

    const periodeLabel = formatPeriode(cotisation.periode, cotisation.year);
    const factureFilename = cotisation.facture_path ? path.basename(cotisation.facture_path) : null;
    let factureSize = '0 KB';
    if (factureFilename && fs.existsSync(path.join(docPath, factureFilename))) {
      factureSize = formatFileSize(fs.statSync(path.join(docPath, factureFilename)).size);
    }
    const refFacture = cotisation.facture_path ? `FACT-${cotisation.year}-${String(cotisation.periode || '').slice(0, 2)}-${String(cotisation.id).padStart(5, '0')}` : null;

    const employes = (cotisation.declarations_employes || []).map((d) => {
      const e = d.employe;
      return {
        id: e ? String(e.id) : String(d.employeId),
        nom: (e && e.last_name) ? e.last_name.toUpperCase() : '',
        prenom: (e && e.first_name) ? e.first_name : '',
        matricule: (e && (e.matricule || e.no_immatriculation)) ? (e.matricule || e.no_immatriculation) : '',
        poste: (e && e.fonction) ? e.fonction : '',
        salaire_brut: Number(d.salary_brut || 0),
        cotisation: Number(d.total_cotisation || 0)
      };
    });

    res.json({
      periode: periodeLabel,
      mois: (cotisationUtil.getMonthByName && cotisationUtil.getMonthByName(cotisation.periode))?.code || '01',
      annee: String(cotisation.year),
      nombre_employes: cotisation.current_effectif ?? employes.length,
      masse_salariale: Number(cotisation.total_salary || 0),
      total_cotisations: Number(cotisation.total_branche || cotisation.total_cotisation || 0),
      facture: {
        id: String(cotisation.id),
        nom: `Facture de Déclaration - ${periodeLabel}`,
        reference: refFacture || `FACT-${cotisation.id}`,
        date: cotisation.createdAt ? (cotisation.createdAt.toISOString ? cotisation.createdAt.toISOString() : cotisation.createdAt).slice(0, 10) : null,
        periode: periodeLabel,
        montant: Number(cotisation.total_branche || cotisation.total_cotisation || 0),
        taille: factureSize,
        statut: 'validée',
        url_download: `/api/v1/quitus/facture/${cotisation.id}`
      },
      employes
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// POST /api/v1/quitus/verifier-paiement — renvoie la dernière cotisation déjà payée
router.post('/verifier-paiement', EmployeurToken, async (req, res) => {
  try {
    console.log('\n========== QUITUS verifier-paiement (requête reçue) ==========');
    const employeurId = req.user.user_id;

    const cotisation = await CotisationEmployeur.findOne({
      where: { employeurId, is_paid: true },
      order: [['paid_date', 'DESC'], ['createdAt', 'DESC']],
      include: [{ model: Quittance, as: 'quittances', required: false }, { model: Paiement, as: 'paiements', required: false }]
    });

    if (!cotisation) {
      return res.status(404).json({ message: 'Aucun paiement trouvé pour cette période' });
    }

    const periodeName = cotisation.periode;
    const annee = String(cotisation.year);
    const mois = (cotisationUtil.getMonthByName && cotisationUtil.getMonthByName(cotisation.periode))?.code || '01';
    const totalCotisations = Number(cotisation.total_branche || cotisation.total_cotisation || 0);
    const quittances = cotisation.quittances || [];
    const quittance = quittances[0];
    const paiements = cotisation.paiements || [];
    const paidP = paiements.find((p) => p && (p.is_paid === true || p.is_paid === 1)) || paiements[0];
    const datePaiement = cotisation.paid_date || (paidP && paidP.paid_date) || (quittance && quittance.createdAt);
    const refP = paidP && (paidP.merchantReference || paidP.invoiceId) ? (paidP.merchantReference || paidP.invoiceId) : null;
    const reference = refP || quittance?.reference || `PAY-${annee}-${String(mois).padStart(2, '0')}-${cotisation.id}`;
    const periodeLabel = formatPeriode(periodeName, annee);

    // On a filtré par is_paid: true, donc on renvoie toujours payé
    const statut = 'payé';
    const montantPaye = totalCotisations;

    let quittanceObj = null;
    if (quittance) {
      let taille = '0 KB';
      if (quittance.doc_path) {
        const p = quittance.doc_path.replace(/^\/api\/v1\/docsx\//, '');
        const full = path.join(docPath, path.basename(p));
        if (fs.existsSync(full)) taille = formatFileSize(fs.statSync(full).size);
      }
      quittanceObj = {
        id: String(quittance.id),
        nom: `Quittance de Paiement - ${periodeLabel}`,
        reference: quittance.reference || reference,
        date: datePaiement ? (typeof datePaiement === 'string' ? datePaiement : datePaiement.toISOString()).slice(0, 10) : null,
        periode: periodeLabel,
        montant: totalCotisations,
        taille,
        statut: 'payée',
        url_download: `/api/v1/quitus/quittance/${quittance.id}`
      };
    }

    const payload = {
      periode: periodeLabel,
      total_cotisations: totalCotisations,
      montant_paye: montantPaye,
      date_paiement: datePaiement ? (typeof datePaiement === 'string' ? datePaiement : datePaiement.toISOString()).slice(0, 10) : null,
      reference,
      statut,
      nombre_employes: cotisation.current_effectif ?? 0,
      masse_salariale: Number(cotisation.total_salary || 0),
      banque: paidP && paidP.bank_name
        ? { nom: paidP.bank_name, code: (paidP.bank_name || '').slice(0, 4).toUpperCase() }
        : { nom: '-', code: '-' },
      quittance: quittanceObj
    };
    console.log('---------- QUITUS verifier-paiement RESPONSE envoyée au front ----------');
    console.log(JSON.stringify(payload, null, 2));
    console.log('------------------------------------------------------------------------\n');
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/quitus/documents-enregistres
// Lit Employeur (rccm_file, nif_file) en priorité ; sinon fallback sur Demande
router.get('/documents-enregistres', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const employeur = await Employeur.findByPk(employeurId, {
      attributes: ['id', 'rccm_file', 'nif_file', 'updatedAt']
    });
    const lastDemande = await Demande.findOne({
      where: { employeurId },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'rccm_file', 'nif_file', 'createdAt']
    });
    const lastQuitusDemande = await QuitusDemande.findOne({
      where: { employeur_id: employeurId },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'document_rccm', 'document_nif', 'createdAt']
    });

    const data = [];
    const pushDoc = (filePath, nom, type, refPrefix, sourceId, dateVal) => {
      if (!filePath) return;
      const p = path.basename(filePath);
      let taille = '0 KB';
      let full = path.isAbsolute(filePath) ? filePath : null;
      if (!full) {
        const candidates = [
          path.join(uploadsDir, p),
          path.join(ROOT_DIR, 'uploads', p)
        ];
        full = candidates.find((c) => fs.existsSync(c)) || path.join(uploadsDir, p);
      }
      if (fs.existsSync(full)) taille = formatFileSize(fs.statSync(full).size);
      data.push({
        id: `SAVED-${type.toUpperCase()}-${sourceId}`,
        nom,
        reference: `${refPrefix}-GN-${new Date().getFullYear()}-${String(sourceId).padStart(5, '0')}`,
        date_upload: dateVal || null,
        taille,
        type
      });
    };

    const rccmPath = employeur?.rccm_file || lastQuitusDemande?.document_rccm || lastDemande?.rccm_file;
    const nifPath = employeur?.nif_file || lastQuitusDemande?.document_nif || lastDemande?.nif_file;
    const srcId = employeur?.id ?? lastQuitusDemande?.id ?? lastDemande?.id ?? employeurId;
    const dateSrc = employeur?.updatedAt || lastQuitusDemande?.createdAt || lastDemande?.createdAt;
    const dateVal = dateSrc ? (dateSrc.toISOString?.()?.slice(0, 10) || null) : null;

    pushDoc(rccmPath, 'RCCM - Registre du Commerce', 'rccm', 'RCCM', srcId, dateVal);
    pushDoc(nifPath, "NIF - Numéro d'Identification Fiscale", 'nif', 'NIF', srcId, dateVal);

    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// POST /api/v1/quitus/demandes (JSON or multipart)
const maybeUpload = (req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    return upload.fields([
      { name: 'document_rccm', maxCount: 1 },
      { name: 'document_nif', maxCount: 1 },
      { name: 'document_autres', maxCount: 3 }
    ])(req, res, next);
  }
  next();
};

router.post('/demandes', EmployeurToken, maybeUpload, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    let body = req.body || {};
    if (typeof body.demande === 'string') {
      try {
        body = { ...body, ...JSON.parse(body.demande) };
      } catch (_) {}
    }

    const { mois, annee, declaration_confirmee, paiement_confirme } = body;
    if (!mois || !annee) {
      const msg = 'mois et annee requis';
      console.log('[quitus/demandes 400]', msg);
      return res.status(400).json({ message: msg });
    }
    if (!declaration_confirmee || !paiement_confirme) {
      const msg = 'La déclaration et le paiement doivent être confirmés';
      console.log('[quitus/demandes 400]', msg);
      return res.status(400).json({ message: msg });
    }

    const year = parseInt(annee, 10);
    const monthInfo = getMonthByCode(String(mois).padStart(2, '0'));
    const periodeName = monthInfo ? monthInfo.name : null;
    if (!periodeName) {
      const msg = 'Période invalide';
      console.log('[quitus/demandes 400]', msg);
      return res.status(400).json({ message: msg });
    }

    const cotisation = await CotisationEmployeur.findOne({
      where: { employeurId, year, periode: periodeName }
    });

    if (!cotisation) {
      return res.status(404).json({ message: 'Aucune déclaration trouvée pour cette période' });
    }

    // Autoriser si période payée OU si employeur a au moins une cotisation payée (dernière payée)
    if (!cotisation.is_paid) {
      const lastPaid = await CotisationEmployeur.findOne({
        where: { employeurId, is_paid: true },
        order: [['id', 'DESC']],
        attributes: ['id']
      });
      if (!lastPaid) {
        const msg = 'Les cotisations de cette période doivent être payées avant de demander un quitus';
        console.log('[quitus/demandes 400]', msg);
        return res.status(400).json({ message: msg });
      }
    }

    const periodeLabel = formatPeriode(periodeName, annee);
    const montant = Number(cotisation.total_branche || cotisation.total_cotisation || 0);

    let documentRccm = null;
    let documentNif = null;
    const employeur = await Employeur.findByPk(employeurId, { attributes: ['id', 'rccm_file', 'nif_file'] });
    const lastDemande = await Demande.findOne({ where: { employeurId }, order: [['createdAt', 'DESC']] });
    const lastQuitusDemande = await QuitusDemande.findOne({
      where: { employeur_id: employeurId },
      order: [['createdAt', 'DESC']],
      attributes: ['document_rccm', 'document_nif']
    });
    const rccmFile = req.files && req.files.document_rccm && req.files.document_rccm[0];
    const nifFile = req.files && req.files.document_nif && req.files.document_nif[0];
    if (rccmFile && rccmFile.filename) documentRccm = path.join(uploadsDir, rccmFile.filename);
    else documentRccm = employeur?.rccm_file || lastQuitusDemande?.document_rccm || lastDemande?.rccm_file;
    if (nifFile && nifFile.filename) documentNif = path.join(uploadsDir, nifFile.filename);
    else documentNif = employeur?.nif_file || lastQuitusDemande?.document_nif || lastDemande?.nif_file;

    if (!documentRccm || !documentNif) {
      const msg = 'Les documents RCCM et NIF sont obligatoires';
      console.log('[quitus/demandes 400]', msg, { documentRccm: !!documentRccm, documentNif: !!documentNif });
      return res.status(400).json({ message: msg });
    }

    // Mettre à jour Employeur quand de nouveaux fichiers sont uploadés
    if (employeur && (rccmFile || nifFile)) {
      const updates = {};
      if (rccmFile && rccmFile.filename) updates.rccm_file = documentRccm;
      if (nifFile && nifFile.filename) updates.nif_file = documentNif;
      if (Object.keys(updates).length > 0) await employeur.update(updates);
    }

    const reference = await getNextReference(employeurId);
    const created = await QuitusDemande.create({
      employeur_id: employeurId,
      reference,
      cotisation_employeur_id: cotisation.id,
      mois: String(mois).padStart(2, '0'),
      annee: String(annee),
      periode: periodeLabel,
      statut: 'en_cours',
      montant,
      document_rccm: documentRccm,
      document_nif: documentNif
    });

    const dateDemande = created.createdAt ? (created.createdAt.toISOString ? created.createdAt.toISOString() : created.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10);
    res.status(201).json({
      id: created.reference,
      periode: periodeLabel,
      date_demande: dateDemande,
      statut: 'en_cours',
      montant
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/quitus/demandes
router.get('/demandes', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const statut = req.query.statut;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));

    const where = { employeur_id: employeurId };
    if (statut === 'en_cours' || statut === 'valide') where.statut = statut;

    const { count, rows } = await QuitusDemande.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      attributes: ['id', 'reference', 'periode', 'statut', 'montant', 'createdAt']
    });

    const data = rows.map((d) => {
      const dateDemande = d.createdAt ? (d.createdAt.toISOString ? d.createdAt.toISOString() : d.createdAt).slice(0, 10) : null;
      return {
        id: d.reference || `QUI-${d.id}`,
        periode: d.periode || '',
        date_demande: dateDemande,
        statut: d.statut || 'en_cours',
        montant: Number(d.montant || 0)
      };
    });

    res.json({
      data,
      pagination: { page, limit, total: count }
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/quitus/demandes/:id
router.get('/demandes/:id', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const idParam = req.params.id;
    const idNum = parseInt(idParam, 10);
    const byRef = idParam.startsWith('QUI-');

    let where = { employeur_id: employeurId };
    if (byRef) where.reference = idParam;
    else where[Op.or] = [{ id: isNaN(idNum) ? -1 : idNum }, { reference: idParam }];

    const d = await QuitusDemande.findOne({ where });
    if (!d) return res.status(404).json({ message: 'Demande introuvable' });

    const dateDemande = d.createdAt ? (d.createdAt.toISOString ? d.createdAt.toISOString() : d.createdAt).slice(0, 10) : null;
    res.json({
      id: d.reference || `QUI-${d.id}`,
      periode: d.periode || '',
      date_demande: dateDemande,
      statut: d.statut || 'en_cours',
      montant: Number(d.montant || 0)
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/quitus/facture/:id — envoi du PDF en buffer (comme /api/v1/documents/:id/file)
router.get('/facture/:id', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });

    const cotisation = await CotisationEmployeur.findOne({
      where: { id, employeurId }
    });
    if (!cotisation) return res.status(404).json({ message: 'Facture introuvable' });
    if (!cotisation.facture_path) return res.status(404).json({ message: 'Document non disponible' });

    const filename = (cotisation.facture_path.match(/docsx\/(.+)$/) || [null, path.basename(cotisation.facture_path)])[1];
    if (!filename) return res.status(404).json({ message: 'Document non disponible' });
    const fullPath = path.join(docPath, path.basename(filename));
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'Document non disponible' });

    const buffer = fs.readFileSync(fullPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="facture-${cotisation.periode || id}-${cotisation.year}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/quitus/quittance/:id — envoi du PDF en buffer
router.get('/quittance/:id', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });

    const quittance = await Quittance.findOne({
      where: { id, employeurId }
    });
    if (!quittance) return res.status(404).json({ message: 'Quittance introuvable' });
    if (!quittance.doc_path) return res.status(404).json({ message: 'Document non disponible' });

    const filename = (quittance.doc_path.match(/docsx\/(.+)$/) || [null, path.basename(quittance.doc_path)])[1];
    if (!filename) return res.status(404).json({ message: 'Document non disponible' });
    const fullPath = path.join(docPath, path.basename(filename));
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'Document non disponible' });

    const buffer = fs.readFileSync(fullPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quittance-${quittance.reference || id}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// GET /api/v1/quitus/demandes/:id/document (attestation quitus - uniquement si statut=valide)
router.get('/demandes/:id/document', EmployeurToken, async (req, res) => {
  try {
    const employeurId = req.user.user_id;
    const idParam = req.params.id;

    let where = { employeur_id: employeurId };
    if (idParam.startsWith('QUI-')) where.reference = idParam;
    else where[Op.or] = [{ id: parseInt(idParam, 10) }, { reference: idParam }];

    const d = await QuitusDemande.findOne({
      where,
      attributes: ['id', 'reference', 'document_path', 'statut']
    });
    if (!d) return res.status(404).json({ message: 'Demande introuvable' });
    if (d.statut !== 'valide') return res.status(404).json({ message: 'Document non disponible' });
    if (!d.document_path) return res.status(404).json({ message: 'Document non disponible' });

    const fullPath = path.isAbsolute(d.document_path) ? d.document_path : path.join(uploadsDir, path.basename(d.document_path));
    if (!fs.existsSync(fullPath)) return res.status(404).json({ message: 'Document non disponible' });

    const buffer = fs.readFileSync(fullPath);
    const filename = `quitus-${d.reference || d.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
});

// ============================================================
// BO ROUTES — pas de filtre par employeur_id
// ============================================================

/**
 * GET /bo/stats
 * Statistiques globales (toutes demandes)
 */
router.get('/bo/stats', async (req, res) => {
  try {
    const total = await QuitusDemande.count();
    const valide = await QuitusDemande.count({ where: { statut: 'valide' } });
    const en_cours = await QuitusDemande.count({ where: { statut: 'en_cours' } });
    return res.status(200).json({ success: true, data: { total, valide, en_cours } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /bo/demandes
 * Liste paginée de TOUTES les demandes avec info employeur
 * Query: page, limit, statut, search
 */
router.get('/bo/demandes', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 15);
    const offset = (page - 1) * limit;
    const statut = req.query.statut;
    const search = req.query.search ? req.query.search.trim() : null;

    const where = {};
    if (statut && statut !== 'all') where.statut = statut;

    const include = [{
      model: Employeur,
      as: 'employeur',
      attributes: ['id', 'raison_sociale', 'no_immatriculation', 'email', 'phone_number'],
      ...(search ? { where: { raison_sociale: { [Op.like]: `%${search}%` } } } : {})
    }];

    const { count, rows } = await QuitusDemande.findAndCountAll({
      where,
      include,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /bo/demandes/:id
 * Détail d'une demande (BO)
 */
router.get('/bo/demandes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'ID invalide' });

    const demande = await QuitusDemande.findByPk(id, {
      include: [{
        model: Employeur,
        as: 'employeur',
        attributes: ['id', 'raison_sociale', 'no_immatriculation', 'email', 'phone_number', 'adresse']
      }]
    });

    if (!demande) return res.status(404).json({ success: false, message: 'Demande introuvable' });
    return res.status(200).json({ success: true, data: demande });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /bo/demandes/:id/valider
 * Valide une demande de quitus (statut -> valide)
 */
router.put('/bo/demandes/:id/valider', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'ID invalide' });

    const demande = await QuitusDemande.findByPk(id);
    if (!demande) return res.status(404).json({ success: false, message: 'Demande introuvable' });
    if (demande.statut === 'valide') {
      return res.status(400).json({ success: false, message: 'Demande déjà validée' });
    }

    demande.statut = 'valide';
    await demande.save();

    return res.status(200).json({ success: true, data: demande });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
