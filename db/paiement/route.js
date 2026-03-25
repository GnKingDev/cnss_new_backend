const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const multer = require('multer');
const Paiement = require('./model');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');
const CotisationEmployeur = require('../cotisation_employeur/model');
const Penalite = require('../penalites/model');
const Quittance = require('../quittance/model');
const Document = require('../document/model');
const Demploye = require('../declaration-employe/model');
const utility = require('./utility');
const { EmployeToken, EmployeurToken } = require('../users/utility');
const { verifyToken } = require('../XYemployeurs/utility');
const { Op } = require('sequelize');

let genereQuittance, sendMailSuccesfulPaiement, addJob, addDeclarationCredit, closePenality, exportPaiement;
try {
  const u2 = require('../../utility2');
  genereQuittance = u2.genereQuittance || (() => Promise.resolve());
  sendMailSuccesfulPaiement = u2.sendMailSuccesfulPaiement || (() => Promise.resolve());
  exportPaiement = u2.exportPaiement || (async () => Buffer.from(''));
} catch (err) {
  genereQuittance = () => Promise.resolve();
  sendMailSuccesfulPaiement = () => Promise.resolve();
  exportPaiement = async () => Buffer.from('');
}
try {
  addJob = require('../../config.queue').addJob;
} catch (err) {
  addJob = async () => null;
}
try {
  const oldDb = require('../../old.db');
  addDeclarationCredit = oldDb.addDeclarationCredit || (() => Promise.resolve());
  closePenality = oldDb.closePenality || (() => Promise.resolve());
} catch (err) {
  addDeclarationCredit = () => Promise.resolve();
  closePenality = () => Promise.resolve();
}

/**
 * Module `db/paiement/route.js` – Gestion des paiements
 * 
 * Ce module gère tous les aspects des paiements de cotisations sociales.
 * Base path: /api/v1/paiement
 */

// Month codes mapping
const mounth = [
  { name: "JANVIER", id: 0, code: "01" },
  { name: "FEVRIER", id: 1, code: "02" },
  { name: "MARS", id: 2, code: "03" },
  { name: "AVRIL", id: 3, code: "04" },
  { name: "MAI", id: 4, code: "05" },
  { name: "JUIN", id: 5, code: "06" },
  { name: "JUILLET", id: 6, code: "07" },
  { name: "AOUT", id: 7, code: "08" },
  { name: "SEPTEMBRE", id: 8, code: "09" },
  { name: "OCTOBRE", id: 9, code: "10" },
  { name: "NOVEMBRE", id: 10, code: "11" },
  { name: "DECEMBRE", id: 11, code: "12" },
  { name: "13e MOIS", id: 12, code: "13", libel: "13e MOIS" },
  { name: "14e MOIS", id: 13, code: "14", libel: "14e MOIS" },
  { name: "15e MOIS", id: 14, code: "15", libel: "15e MOIS" }
];

// Bank codes mapping (from banques/utility.js - to be imported or defined)
// This is a stub - should be imported from db/banques/utility.js
const bulkAdd = [
  { name: "CAISSE", collector_code: "CNSSCAISSE", old_db_id: 0 },
  { name: "UBA Guinée", collector_code: "GNUBA", old_db_id: 23 },
  // Add more banks as needed
];

/**
 * Helper: Parse pagination parameters
 */
const getPaginationParams = (req) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 5));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

/**
 * Helper: Format paginated response
 */
const formatPaginatedResponse = (data, total, page, limit) => {
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Helper: Get bank name from collector code
 */
const getBankName = (collectorCode) => {
  const bank = bulkAdd.find(b => b.collector_code === collectorCode);
  return bank ? bank.name : collectorCode;
};

/**
 * Helper: Generate quittance reference
 */
const generateQuittanceReference = (no_immatriculation, periodeQuittance, type) => {
  return `${no_immatriculation}${periodeQuittance}${type}`;
};

/**
 * Helper: Process payment success (generate quittance, update cotisation, etc.)
 * This is a complex function that should be extracted to a separate utility
 */
const processPaymentSuccess = async (Paiement, bankName, paid_by_us = false) => {
  try {
    // Reload paiement with relations
    await Paiement.reload({
      include: [
        { association: 'cotisation_employeur' },
        { association: 'employeur' }
      ]
    });

    const Demployeur = Paiement.cotisation_employeur;
    const Employeur = Paiement.employeur;

    // Find month code
    const month = mounth.find(e => e.name == Demployeur.periode);
    const code = month ? month.code : "01";
    const year = Demployeur.year;

    // Generate period strings
    let periode = `${code}/${year}`;
    let periodeQuittance = `${code}${year}`;

    // Handle special months (13e, 14e, 15e mois)
    if (month && month.libel) {
      periode = `${month.libel} ${year}`;
      periodeQuittance = `${month.code}${year}`;
    }

    // Generate unique code and filename
    const codeUnique = utility.generateUniqueCode(9);
    const fileName = `Quittance-${Employeur.no_immatriculation}-${periodeQuittance}-${codeUnique}`;
    const type = Math.random() < 0.5 ? "01" : "02" + Math.floor(Math.random() * 1000);

    await genereQuittance(Paiement, periodeQuittance, fileName, codeUnique, periode, type, bankName);

    // Update cotisation
    Demployeur.quittance = `/api/v1/docsx/${fileName}.pdf`;
    Demployeur.is_paid = true;
    Demployeur.paid_date = new Date().toISOString();
    Demployeur.motif = "PAIEMENT DU PRINCIPAL";
    await Demployeur.save();

    // Create document
    await Document.create({
      name: `Quittance-${periode}`,
      path: `/api/v1/docsx/${fileName}.pdf`,
      code: codeUnique,
      employeurId: Employeur.id
    });

    // Generate reference
    const reference = generateQuittanceReference(Employeur.no_immatriculation, periodeQuittance, type);

    // Create quittance
    await Quittance.create({
      reference: reference,
      secret_code: codeUnique,
      doc_path: `/api/v1/docsx/${fileName}.pdf`,
      employeurId: Employeur.id,
      cotisation_employeurId: Demployeur.id,
      paiementId: Paiement.id
    });

    await sendMailSuccesfulPaiement(Paiement, periode, fileName);

    await addDeclarationCredit(Demployeur, reference, periode, Paiement);

    const employes = await Demploye.findAll({
      where: { cotisation_employeurId: Demployeur.id },
      include: [{ association: 'employe' }]
    });

    if (employes.length > 0) {
      await addJob({
        type: 'send_sms',
        Employe: employes.map(e => e.employe),
        Employeur: Employeur,
        periode: periode
      });
    }

    return {
      quittance: `/api/v1/docsx/${fileName}.pdf`,
      reference: reference
    };
  } catch (error) {
    console.error('[PAIEMENT] Error processing payment success:', error);
    throw error;
  }
};

// ============================================
// 1. ROUTES DE CONSULTATION
// ============================================

/**
 * GET /api/v1/paiement/list
 * 
 * Liste tous les paiements de l'employeur associé à l'employé connecté.
 * Middleware: EmployeToken
 */
router.get('/list', EmployeToken, async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const employe = await Employe.findByPk(req.user.user_id, {
      include: [{ association: 'employeur' }]
    });

    if (!employe || !employe.employeur) {
      return res.status(404).json({ message: 'Employé ou employeur non trouvé' });
    }

      const result = await Paiement.findAndCountAll({
      where: { employeurId: employe.employeur.id },
      include: [
        { association: 'cotisation_employeur' },
        { association: 'employeur' }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[PAIEMENT] Error getting list:', error);
    return res.status(400).json({ message: 'erreur' });
  }
});

/**
 * GET /api/v1/paiement/list_for_employeur
 * 
 * Liste tous les paiements de l'employeur connecté.
 * Middleware: EmployeurToken
 */
router.get('/list_for_employeur', EmployeurToken, async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const result = await Paiement.findAndCountAll({
      where: { employeurId: req.user.user_id },
      include: [
        { association: 'cotisation_employeur' },
        { association: 'employeur' }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[PAIEMENT] Error getting list for employeur:', error);
    return res.status(400).json({ message: 'Erreur veuillez reessayer' });
  }
});

/**
 * GET /api/v1/paiement/payeur_list_payement
 * 
 * Liste tous les paiements pour un payeur (utilisateur délégué).
 * Middleware: EmployeurToken
 */
router.get('/payeur_list_payement', EmployeurToken, async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const employeur = await Employeur.findOne({
      where: { no_immatriculation: req.user.user_identify }
    });

    if (!employeur) {
      return res.status(404).json({ message: 'Employeur non trouvé' });
    }

      const result = await Paiement.findAndCountAll({
      where: { employeurId: employeur.id },
      include: [
        { association: 'cotisation_employeur' },
        { association: 'employeur' }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[PAIEMENT] Error getting payeur list:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * GET /api/v1/paiement/list_non_payes
 *
 * Liste les paiements non payés dont le statut est "Nouveau" (employeur connecté).
 * Middleware: EmployeurToken
 */
router.get('/list_non_payes', EmployeurToken, async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);

    const result = await Paiement.findAndCountAll({
      where: {
        employeurId: req.user.user_id,
        status: 'Nouveau',
        is_paid: false
      },
      include: [
        { association: 'cotisation_employeur' },
        { association: 'employeur' }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json(formatPaginatedResponse(result.rows, result.count, page, limit));
  } catch (error) {
    console.error('[PAIEMENT] Error getting list_non_payes:', error);
    return res.status(400).json({ message: 'Erreur lors de la récupération des paiements non payés' });
  }
});

// ============================================
// 2. INITIATION DE PAIEMENT
// ============================================

/**
 * GET /api/v1/paiement/init/:id
 * 
 * Initialise un paiement pour une cotisation (initié par un employé).
 * Middleware: EmployeToken
 * Paramètres: :id = cotisation_employeurId
 */
router.get('/init/:id', EmployeToken, async (req, res) => {
  try {
    const cotisationId = parseInt(req.params.id);
    if (isNaN(cotisationId)) {
      return res.status(400).json({ message: 'ID de cotisation invalide' });
    }

    // Get employe with employeur
    const employe = await Employe.findByPk(req.user.user_id, {
      include: [{ association: 'employeur' }]
    });

    if (!employe || !employe.employeur) {
      return res.status(404).json({ message: 'Employé ou employeur non trouvé' });
    }

    // Get or create paiement
    let Paiement = await Paiement.findOne({
      where: { cotisation_employeurId: cotisationId },
      include: [
        { association: 'cotisation_employeur' },
        { association: 'employeur' }
      ]
    });

    if (!Paiement) {
      // Create new paiement
      const Cotisation = await CotisationEmployeur.findByPk(cotisationId);
      if (!Cotisation) {
        return res.status(404).json({ message: 'Cotisation non trouvée' });
      }

      Paiement = await Paiement.create({
        cotisation_employeurId: cotisationId,
        employeurId: Employe.employeur.id,
        status: 'Nouveau'
      });

      await Paiement.reload({
        include: [
          { association: 'cotisation_employeur' },
          { association: 'employeur' }
        ]
      });
    }

    const UUID = utility.geneUID();

    // If payment already has merchantReference and invoiceId, return existing link
    if (Paiement.merchantReference && Paiement.invoiceId) {
      const link = utility.getPaymentLink({
        merchantReference: Paiement.merchantReference,
        invoiceId: Paiement.invoiceId
      });
      Paiement.status = 'Nouveau';
      Paiement.employeId = req.user.user_id;
      Paiement.which_methode = 'Banque';
      await Paiement.save();
      return res.status(200).json({ link });
    }

    // Initialize payment in Paylican
    const detail = await utility.initPaiment(Paiement, employe.employeur, UUID);

    // Update paiement
    Paiement.merchantReference = detail.merchantReference || UUID;
    Paiement.invoiceId = detail.invoiceId || detail.id;
    Paiement.employeId = req.user.user_id;
    Paiement.status = 'Nouveau';
    Paiement.which_methode = 'Banque';
    await Paiement.save();

    // Generate payment link
    const link = utility.getPaymentLink(detail);

    return res.status(200).json({ link });
  } catch (error) {
    console.error('[PAIEMENT] Error initializing payment:', error);
    return res.status(400).json({ message: 'Erreur pour initiation du paiement' });
  }
});

/**
 * GET /api/v1/paiement/payeur/init-by-cotisation/:id
 *
 * Initialise un paiement par cotisation (employeur connecté). Même logique que init/:id mais EmployeurToken.
 * Paramètres: :id = cotisation_employeurId
 */
router.get('/payeur/init-by-cotisation/:id', EmployeurToken, async (req, res) => {
  try {
    const cotisationId = parseInt(req.params.id);
    if (isNaN(cotisationId)) {
      return res.status(400).json({ message: 'ID de cotisation invalide' });
    }
    const employeur = await Employeur.findOne({
      where: { no_immatriculation: req.user.user_identify }
    });
    if (!employeur) {
      return res.status(404).json({ message: 'Employeur non trouvé' });
    }
    const employeurId = employeur.id;
    let paiementRow = await Paiement.findOne({
      where: { cotisation_employeurId: cotisationId, employeurId },
      include: [{ association: 'cotisation_employeur' }, { association: 'employeur' }]
    });
    if (!paiementRow) {
      const cotisation = await CotisationEmployeur.findByPk(cotisationId);
      if (!cotisation) {
        return res.status(404).json({ message: 'Cotisation non trouvée' });
      }
      paiementRow = await Paiement.create({
        cotisation_employeurId: cotisationId,
        employeurId,
        status: 'Nouveau'
      });
      await paiementRow.reload({
        include: [{ association: 'cotisation_employeur' }, { association: 'employeur' }]
      });
    }
    const UUID = utility.geneUID();
    if (paiementRow.merchantReference && paiementRow.invoiceId) {
      const link = utility.getPaymentLink({
        merchantReference: paiementRow.merchantReference,
        invoiceId: paiementRow.invoiceId
      });
      paiementRow.status = 'Nouveau';
      paiementRow.userId = req.user.id;
      paiementRow.which_methode = 'Banque';
      await paiementRow.save();
      return res.status(200).json({ link });
    }
    const detail = await utility.initPaiment(paiementRow, employeur, UUID);
    paiementRow.merchantReference = detail.merchantReference || UUID;
    paiementRow.invoiceId = detail.invoiceId || detail.id;
    paiementRow.userId = req.user.id;
    paiementRow.status = 'Nouveau';
    paiementRow.which_methode = 'Banque';
    await paiementRow.save();
    const link = utility.getPaymentLink(detail);
    return res.status(200).json({ link });
  } catch (error) {
    console.error('[PAIEMENT] Error init-by-cotisation (payeur):', error);
    return res.status(400).json({ message: 'Erreur pour initiation du paiement' });
  }
});

/**
 * GET /api/v1/paiement/payeur/init/:id
 *
 * Initialise un paiement pour une cotisation (initié par un payeur/employeur).
 * Middleware: EmployeurToken
 * Paramètres: :id = paiement ID
 */
router.get('/payeur/init/:id', EmployeurToken, async (req, res) => {
  try {
    const paiementId = parseInt(req.params.id);
    if (isNaN(paiementId)) {
      return res.status(400).json({ message: 'ID de paiement invalide' });
    }

    // Get paiement
    let Paiement = await Paiement.findByPk(paiementId, {
      include: [
        { association: 'cotisation_employeur' },
        { association: 'employeur' }
      ]
    });

    if (!Paiement) {
      return res.status(404).json({ message: 'Paiement non trouvé' });
    }

    // Get employeur
    const employeur = await Employeur.findOne({
      where: { no_immatriculation: req.user.user_identify }
    });

    if (!employeur) {
      return res.status(404).json({ message: 'Employeur non trouvé' });
    }

    const UUID = utility.geneUID();

    // If payment already has merchantReference and invoiceId, return existing link
    if (Paiement.merchantReference && Paiement.invoiceId) {
      const link = utility.getPaymentLink({
        merchantReference: Paiement.merchantReference,
        invoiceId: Paiement.invoiceId
      });
      Paiement.status = 'Nouveau';
      Paiement.userId = req.user.id;
      Paiement.which_methode = 'Banque';
      await Paiement.save();
      return res.status(200).json({ link });
    }

    // Initialize payment in Paylican
    const detail = await utility.initPaiment(Paiement, employeur, UUID);

    // Update paiement
    Paiement.merchantReference = detail.merchantReference || UUID;
    Paiement.invoiceId = detail.invoiceId || detail.id;
    Paiement.userId = req.user.id;
    Paiement.status = 'Nouveau';
    Paiement.which_methode = 'Banque';
    await Paiement.save();

    // Generate payment link
    const link = utility.getPaymentLink(detail);

    return res.status(200).json({ link });
  } catch (error) {
    console.error('[PAIEMENT] Error initializing payment (payeur):', error);
    return res.status(400).json({ message: 'Erreur pour initiation du paiement' });
  }
});

/**
 * GET /api/v1/paiement/init/penalite/paiement/:id
 * 
 * Initialise un paiement pour une pénalité.
 * Middleware: EmployeToken
 * Paramètres: :id = pénalité ID
 */
router.get('/init/penalite/paiement/:id', EmployeToken, async (req, res) => {
  try {
    const penaliteId = parseInt(req.params.id);
    if (isNaN(penaliteId)) {
      return res.status(400).json({ message: 'ID de pénalité invalide' });
    }

    const link = await utility.initPenalite(penaliteId);
    return res.status(200).json({ link });
  } catch (error) {
    console.error('[PAIEMENT] Error initializing penalty payment:', error);
    return res.status(400).json({ message: 'Erreur veuillez reessayer' });
  }
});

// ============================================
// 2b. LENGO PAY – Génération URL de paiement (portal.lengopay.com/api/v1/payments)
// ============================================

const LENGO_BASE_URL = process.env.LENGO_BASE_URL || 'https://portal.lengopay.com';
const LENGO_LICENSE_KEY = process.env.LENGO_LICENSE_KEY || '';
const LENGO_WEBSITE_ID = process.env.LENGO_WEBSITE_ID || '';
const LENGO_RETURN_URL = (process.env.LENGO_RETURN_URL || '').trim() || null;
const LENGO_FAILURE_URL = (process.env.LENGO_FAILURE_URL || '').trim() || null;
const LENGO_CALLBACK_URL = (process.env.LENGO_CALLBACK_URL || '').trim() || null;

/**
 * POST /api/v1/paiement/lengo_cashin
 *
 * Génère une URL de paiement Lengo Pay (POST portal.lengopay.com/api/v1/payments).
 * Body: { amount, currency?, return_url?, failure_url?, callback_url?, cotisation_employeurId? }
 * Réponse Lengo: status, pay_id, payment_url. On renvoie { link, pay_id, status } pour ouvrir la page de paiement.
 * Middleware: EmployeurToken
 */
router.post('/lengo_cashin', EmployeurToken, async (req, res) => {
  try {
    const { amount, currency = 'GNF', return_url, failure_url, callback_url, cotisation_employeurId } = req.body;

    const amountVal = amount != null ? (typeof amount === 'number' ? amount : parseFloat(String(amount).trim())) : NaN;
    if (!Number.isFinite(amountVal) || amountVal <= 0) {
      return res.status(400).json({ message: 'Montant invalide' });
    }

    if (!LENGO_LICENSE_KEY || !LENGO_WEBSITE_ID) {
      return res.status(503).json({ message: 'Paiement Lengo Pay non configuré (LENGO_LICENSE_KEY, LENGO_WEBSITE_ID)' });
    }

    const payload = {
      websiteid: LENGO_WEBSITE_ID,
      amount: Math.round(amountVal),
      currency: (currency || 'GNF').toString()
    };
    if (return_url && typeof return_url === 'string' && return_url.startsWith('http')) payload.return_url = return_url.trim();
    else if (LENGO_RETURN_URL) payload.return_url = LENGO_RETURN_URL;
    if (failure_url && typeof failure_url === 'string' && failure_url.startsWith('http')) payload.failure_url = failure_url.trim();
    else if (LENGO_FAILURE_URL) payload.failure_url = LENGO_FAILURE_URL;
    if (callback_url && typeof callback_url === 'string' && callback_url.startsWith('http')) payload.callback_url = callback_url.trim();
    else if (LENGO_CALLBACK_URL) payload.callback_url = LENGO_CALLBACK_URL;

    console.log('[PAIEMENT] lengo_cashin request payload:', JSON.stringify(payload, null, 2));

    const authHeader = 'Basic ' + LENGO_LICENSE_KEY.trim();
    const response = await axios.post(LENGO_BASE_URL + '/api/v1/payments', payload, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const data = response.data || {};
    console.log('[PAIEMENT] lengo_cashin response:', response.status, JSON.stringify(data, null, 2));

    const paymentUrl = data.payment_url;
    if (!paymentUrl || typeof paymentUrl !== 'string') {
      return res.status(502).json({ message: 'Réponse Lengo invalide : payment_url absent' });
    }

    const cotisationId = cotisation_employeurId != null ? parseInt(cotisation_employeurId, 10) : null;
    if (Number.isFinite(cotisationId)) {
      const employeurId = req.user.user_id;
      let paiement = await Paiement.findOne({ where: { cotisation_employeurId: cotisationId, employeurId } });
      if (paiement) {
        paiement.which_methode = 'Mobile Money';
        await paiement.save();
      } else {
        const cotisation = await CotisationEmployeur.findByPk(cotisationId);
        if (cotisation) {
          await Paiement.create({ cotisation_employeurId: cotisationId, employeurId, status: 'Nouveau', which_methode: 'Mobile Money' });
        }
      }
    }

    return res.status(200).json({
      link: paymentUrl,
      payment_url: paymentUrl,
      pay_id: data.pay_id,
      status: data.status,
      message: data.message || 'URL de paiement générée'
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const status = err.response.status;
      const body = err.response.data;
      const msg = body?.message || body?.error || err.message;
      console.log('[PAIEMENT] lengo_cashin Lengo error:', status, JSON.stringify(body, null, 2));
      const httpStatus = status === 401 ? 502 : status === 400 ? 400 : 502;
      return res.status(httpStatus).json({ message: status === 401 ? 'Passerelle de paiement : clé invalide (Lengo Pay)' : (msg || 'Erreur Lengo Pay') });
    }
    console.error('[PAIEMENT] Lengo cashin error:', err);
    return res.status(500).json({ message: 'Erreur lors de l\'initiation du paiement Lengo Pay' });
  }
});

// ============================================
// 2c. ATD – Justificatifs de virement + référence
// ============================================

const atdProofUploadDir = path.join(__dirname, '../../uploads/paiement-atd');
if (!fs.existsSync(atdProofUploadDir)) {
  fs.mkdirSync(atdProofUploadDir, { recursive: true });
}
const atdProofStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, atdProofUploadDir),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase() || '.pdf';
    const base = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').substring(0, 40);
    cb(null, `atd-${Date.now()}-${base}${ext}`);
  }
});
const atdProofUpload = multer({
  storage: atdProofStorage,
  limits: { fileSize: 15 * 1024 * 1024, files: 5 }
});

/**
 * POST /api/v1/paiement/atd_proof
 * Enregistre le mode de paiement ATD + référence + justificatifs (multipart).
 * Body (form): cotisation_employeurId, reference (optionnel). Fichiers: champs "proof" (plusieurs autorisés).
 * Middleware: EmployeurToken
 */
router.post('/atd_proof', EmployeurToken, atdProofUpload.array('proof', 5), async (req, res) => {
  try {
    const cotisationEmployeurId = parseInt(req.body.cotisation_employeurId, 10);
    const reference = (req.body.reference || '').trim() || null;
    if (!Number.isFinite(cotisationEmployeurId)) {
      return res.status(400).json({ message: 'cotisation_employeurId invalide' });
    }
    const employeurId = req.user.user_id;
    let paiement = await Paiement.findOne({
      where: { cotisation_employeurId, employeurId },
      include: [{ association: 'cotisation_employeur' }, { association: 'employeur' }]
    });
    if (!paiement) {
      const cotisation = await CotisationEmployeur.findByPk(cotisationEmployeurId);
      if (!cotisation) {
        return res.status(404).json({ message: 'Cotisation non trouvée' });
      }
      paiement = await Paiement.create({
        cotisation_employeurId,
        employeurId,
        status: 'Nouveau',
        which_methode: 'ATD',
        payment_reference: reference
      });
    } else {
      paiement.which_methode = 'ATD';
      paiement.payment_reference = reference;
    }
    const files = req.files || [];
    const paths = files.map((f) => f.path || f.filename);
    if (paths.length > 0) {
      const existing = (paiement.atd_proof_paths && JSON.parse(paiement.atd_proof_paths)) || [];
      paiement.atd_proof_paths = JSON.stringify([...existing, ...paths]);
    }
    await paiement.save();
    return res.status(200).json({
      message: 'Enregistrement ATD effectué',
      paiementId: paiement.id,
      which_methode: paiement.which_methode,
      payment_reference: paiement.payment_reference
    });
  } catch (err) {
    console.error('[PAIEMENT] atd_proof error:', err);
    return res.status(500).json({ message: 'Erreur lors de l\'enregistrement des justificatifs ATD' });
  }
});

// ============================================
// 3. WEBHOOK PAYLICAN
// ============================================

/**
 * POST /api/v1/paiement/webhook
 * 
 * Reçoit les notifications de Paylican concernant les statuts de paiement.
 * Middleware: Aucun (webhook public, mais devrait être sécurisé)
 */
router.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    const type = data.type;
    const invoiceData = data.data;

    if (!type || !invoiceData) {
      return res.status(400).json({ message: 'Données invalides' });
    }

    const motif = invoiceData.additionalFields?.[0]?.value || 'default';
    const paid_by_us = data.paid_by_us || false;

    // Case 1: Payment for cotisation (default)
    if (motif === 'default') {
      const Paiement = await Paiement.findOne({
        where: {
          invoiceId: invoiceData.id,
          merchantReference: invoiceData.documentNo
        },
        include: [
          { association: 'cotisation_employeur' },
          { association: 'employeur' }
        ]
      });

      if (!Paiement) {
        return res.status(200).json({ message: 'paiement introuvable par id et documentNo' });
      }

      // Check if already processed
      if (Paiement.status === 'Payé') {
        return res.status(200).json({ message: 'le statut du paiement a déjà été changé' });
      }

      if (Paiement.status === 'Rejeté') {
        return res.status(200).json({ message: 'le statut du paiement a déjà été changé' });
      }

      // Handle different event types
      if (type === 'invoice.payment_initiated') {
        Paiement.status = 'En cours';
        await Paiement.save();
        return res.status(200).json({ message: 'statut du paiement modifié' });
      }

      if (type === 'invoice.payment_error') {
        Paiement.status = 'Rejeté';
        await Paiement.save();
        return res.status(200).json({ message: 'statut du paiement modifié' });
      }

      if (type === 'invoice.paid') {
        Paiement.status = 'Payé';
        Paiement.is_paid = true;
        Paiement.paiement_date = new Date().toISOString();
        Paiement.bank_name = invoiceData.bankCode;
        Paiement.paid_by_us = paid_by_us;
        await Paiement.save();

        // Process payment success (generate quittance, etc.)
        const bankName = getBankName(invoiceData.bankCode);
        await processPaymentSuccess(Paiement, bankName, paid_by_us);

        return res.status(200).json({ message: 'okok' });
      }

      if (type === 'invoice.payment_rejected') {
        Paiement.status = 'Rejeté';
        await Paiement.save();
        return res.status(200).json({ message: 'statut du paiement modifié' });
      }
    }

    // Case 2: Payment for penalty (penalite)
    if (motif === 'penalite') {
      const penalite = await Penalite.findOne({
        where: {
          merchantReference: invoiceData.documentNo,
          invoiceId: invoiceData.id
        },
        include: [{ association: 'employeur' }]
      });

      if (!penalite) {
        return res.status(200).json({ message: 'pénalité introuvable' });
      }

      // Check if already processed
      if (penalite.status === 'Rejeté') {
        return res.status(200).json({ message: 'le statut du paiement a déjà été changé' });
      }

      if (penalite.status === 'payé') {
        return res.status(200).json({ message: 'le statut du paiement a déjà été changé' });
      }

      // Handle different event types
      if (type === 'invoice.payment_initiated') {
        penalite.status = 'En cours';
        await penalite.save();
        return res.status(200).json({ message: 'statut du paiement modifié' });
      }

      if (type === 'invoice.payment_error') {
        penalite.status = 'Rejeté';
        await penalite.save();
        return res.status(200).json({ message: 'statut du paiement modifié' });
      }

      if (type === 'invoice.paid') {
        penalite.status = 'payé';
        penalite.is_paid = true;
        await penalite.save();

        await closePenality(penalite.employeur.no_immatriculation, penalite);

        return res.status(200).json({ message: 'okok' });
      }

      if (type === 'invoice.payment_rejected') {
        penalite.status = 'Rejeté';
        await penalite.save();
        return res.status(200).json({ message: 'statut du paiement modifié' });
      }
    }

    return res.status(200).json({ message: 'Événement non géré' });
  } catch (error) {
    console.error('[PAIEMENT] Webhook error:', error);
    return res.status(500).json({ message: 'Erreur interne' });
  }
});

// ============================================
// 4. VALIDATION MANUELLE
// ============================================

/**
 * POST /api/v1/paiement/validate_payment/:id
 * 
 * Valide manuellement un paiement effectué à la caisse CNSS.
 * Middleware: verifyToken (DIRGA/administration)
 * Paramètres: :id = cotisation_employeurId
 */
router.post('/validate_payment/:id', verifyToken, async (req, res) => {
  try {
    const cotisationId = parseInt(req.params.id);
    if (isNaN(cotisationId)) {
      return res.status(400).json({ message: 'ID de cotisation invalide' });
    }

    // Find paiement
    const Paiement = await Paiement.findOne({
      where: { cotisation_employeurId: cotisationId },
      include: [
        { association: 'cotisation_employeur' },
        { association: 'employeur' }
      ]
    });

    if (!Paiement) {
      return res.status(404).json({ message: 'Paiement introuvable' });
    }

    // Check status
    if (Paiement.status === 'Payé') {
      return res.status(400).json({ message: 'Le paiement a déjà été validé' });
    }

    if (Paiement.status === 'Rejeté') {
      return res.status(400).json({ message: 'Le paiement a été rejeté' });
    }

    // Validate payment
    Paiement.status = 'Payé';
    Paiement.is_paid = true;
    Paiement.paiement_date = new Date().toISOString();
    Paiement.bank_name = 'CNSSCAISSE';
    Paiement.paid_by_us = true;
    await Paiement.save();

    // Get bank name
    const bankInfo = bulkAdd.find(e => e.collector_code === 'CNSSCAISSE');
    const bankName = bankInfo ? bankInfo.name : 'CAISSE';

    // Process payment success
    const result = await processPaymentSuccess(Paiement, bankName, true);

    return res.status(200).json({
      message: 'Paiement validé avec succès',
      quittance: result.quittance,
      reference: result.reference
    });
  } catch (error) {
    console.error('[PAIEMENT] Error validating payment:', error);
    if (error.message && error.message.includes('quittance')) {
      return res.status(500).json({ message: 'Erreur lors de la génération de la quittance' });
    }
    return res.status(500).json({ message: 'Erreur interne' });
  }
});

// ============================================
// 5. CONSULTATION PAR PÉRIODE
// ============================================

/**
 * GET /api/v1/paiement/paiement_by_mouth/:start/:choix
 * 
 * Récupère tous les paiements d'un mois spécifique.
 * Middleware: verifyToken (DIRGA/administration)
 * Paramètres: :start = date début (YYYY-MM-DD), :choix = "true" (payés) ou "false" (non payés)
 */
router.get('/paiement_by_mouth/:start/:choix', verifyToken, async (req, res) => {
  try {
    const start = req.params.start;
    const choix = req.params.choix === 'true';
    const getLastMouth = utility.getPremierJourMoisSuivant(start);

    const paiements = await Paiement.findAll({
      where: {
        createdAt: {
          [Op.gte]: new Date(start),
          [Op.lt]: new Date(getLastMouth)
        },
        is_paid: choix
      },
      include: [
        { association: 'employeur' },
        { association: 'cotisation_employeur' }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Map bank codes to names
    const paiementsWithBankNames = paiements.map(paiement => {
      const bankName = paiement.bank_name ? getBankName(paiement.bank_name) : '';
      if (!bankName && paiement.bank_name) {
        console.warn(`[PAIEMENT] Bank code not found: ${paiement.bank_name}`);
      }
      return {
        ...paiement.toJSON(),
        bank_name: bankName || paiement.bank_name
      };
    });

    return res.status(200).json(paiementsWithBankNames);
  } catch (error) {
    console.error('[PAIEMENT] Error getting paiements by month:', error);
    return res.status(400).json({ message: error.message });
  }
});

/**
 * GET /api/v1/paiement/export_paiement/:start/:choix
 * 
 * Exporte les paiements d'un mois en fichier Excel.
 * Middleware: verifyToken (DIRGA/administration)
 * Paramètres: :start = date début (YYYY-MM-DD), :choix = "true" (payés) ou "false" (non payés)
 */
router.get('/export_paiement/:start/:choix', verifyToken, async (req, res) => {
  try {
    const start = req.params.start;
    const choix = req.params.choix === 'true';
    const getLastMouth = utility.getPremierJourMoisSuivant(start);

    const paiements = await Paiement.findAll({
      where: {
        createdAt: {
          [Op.gte]: new Date(start),
          [Op.lt]: new Date(getLastMouth)
        },
        is_paid: choix
      },
      include: [
        { association: 'employeur' },
        { association: 'cotisation_employeur' }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Build export data
    const data = paiements.map(element => ({
      createdAt: new Date(element.createdAt).toLocaleDateString('fr'),
      raison_sociale: element.employeur?.raison_sociale || '',
      periode: `${element.cotisation_employeur?.periode || ''}-${element.cotisation_employeur?.year || ''}`,
      total_branche: element.cotisation_employeur?.real_total_branche || element.cotisation_employeur?.total_branche || 0,
      bank_name: element.bank_name ? getBankName(element.bank_name) : '',
      paid_date: element.paiement_date ? new Date(element.paiement_date).toLocaleDateString('fr') : ''
    }));

    const excelBuffer = await exportPaiement(data);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=paiements-${start}.xlsx`);
    return res.status(200).send(excelBuffer);
  } catch (error) {
    console.error('[PAIEMENT] Error exporting paiements:', error);
    return res.status(400).json({ message: error.message });
  }
});

// ============================================
// 6. MODE DÉGRADÉ
// ============================================

/**
 * POST /api/v1/paiement/degrade_mode/:id
 * 
 * Active le mode dégradé pour un paiement (paiement hors ligne).
 * Middleware: EmployeurToken
 * Paramètres: :id = cotisation_employeurId
 */
router.post('/degrade_mode/:id', EmployeurToken, async (req, res) => {
  try {
    const cotisationId = parseInt(req.params.id);
    const { methode } = req.body;

    if (isNaN(cotisationId)) {
      return res.status(400).json({ message: 'ID de cotisation invalide' });
    }

    if (!methode) {
      return res.status(400).json({ message: 'Méthode de paiement requise' });
    }

    // Get cotisation
    const cotisation = await CotisationEmployeur.findByPk(cotisationId);
    if (!cotisation) {
      return res.status(404).json({ message: 'Cotisation non trouvée' });
    }

    // Activate degrade mode
    cotisation.is_degrade_mode = true;
    cotisation.which_methode = methode;
    await cotisation.save();

    // Get or create paiement
    let Paiement = await Paiement.findOne({
      where: { cotisation_employeurId: cotisationId }
    });

    if (!Paiement) {
      Paiement = await Paiement.create({
        cotisation_employeurId: cotisationId,
        employeurId: cotisation.employeurId,
        status: 'Nouveau'
      });
    }

    // Update paiement
    Paiement.is_degrade_mode = true;
    Paiement.which_methode = methode;
    Paiement.status = 'En cours';
    await Paiement.save();

    return res.status(200).json({ message: 'mode degrédé activé' });
  } catch (error) {
    console.error('[PAIEMENT] Error activating degrade mode:', error);
    return res.status(400).json({ message: error.message });
  }
});

module.exports = { router, processPaymentSuccess };
