const express = require('express');
const router = express.Router();
const axios = require('axios');

const UserAffiliationVolontaire = require('./model');
const AffiliationVolontaire = require('../affiliation-volontaire/model');
const DeclarationAffiliationVolontaire = require('../declaration_affiliation_volontaire/model');
const affiliationUtility = require('../affiliation-volontaire/utility');
const utility = require('./utility');
const utility2 = require('../users/utility2');
const sessionService = require('../../services/session.service');
const { ensureDeclarationsForAffiliation, getYearMonthList, MONTHS_BACK } = require('../declaration_affiliation_volontaire/ensure-declarations');

// Helper: retirer champs sensibles pour les réponses
const sanitizeAvUser = (user) => {
  if (!user) return null;
  const u = user.get ? user.get({ plain: true }) : user;
  const { password, otp_secret, ...rest } = u;
  return rest;
};

// ============================================
// 1. LOGIN & OTP
// ============================================

// POST login — user_identify (no_immatriculation ou email) + password
router.post('/login', async (req, res) => {
  try {
    const { user_identify, password } = req.body;
    if (!user_identify || !password) {
      return res.status(400).json({ message: 'Identifiant et mot de passe requis' });
    }

    const ident = user_identify.trim();
    let userAv = await UserAffiliationVolontaire.findOne({
      where: { user_identify: ident },
      include: [{ model: AffiliationVolontaire, as: 'affiliationVolontaire', attributes: ['id', 'email', 'phone_number', 'no_immatriculation', 'nom', 'prenom'] }]
    });
    if (!userAv) {
      const av = await AffiliationVolontaire.findOne({ where: { no_immatriculation: ident } });
      if (av) {
        userAv = await UserAffiliationVolontaire.findOne({
          where: { affiliationVolontaireId: av.id },
          include: [{ model: AffiliationVolontaire, as: 'affiliationVolontaire', attributes: ['id', 'email', 'phone_number', 'no_immatriculation', 'nom', 'prenom'] }]
        });
      }
    }

    if (!userAv) {
      return res.status(400).json({ message: 'Mot de passe ou identification incorrecte' });
    }

    if (!userAv.password) {
      return res.status(400).json({ message: 'Mot de passe ou identification incorrecte' });
    }

    const isPasswordValid = await utility.comparePassword(password, userAv.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Mot de passe ou identification incorrecte' });
    }

    const av = userAv.affiliationVolontaire;
    if (!userAv.otp_secret) {
      userAv.otp_secret = utility2.generateOtpSecret();
      await userAv.save();
    }
    const otpCode = utility2.generateOtpCode(userAv.otp_secret);
    await utility.setLoginOtpAv(userAv.id, otpCode);

    if (av && av.email) await utility2.sendOptByMail(otpCode, av.email);
    if (av && av.phone_number) await utility2.sendOptCode(otpCode, av.phone_number);

    const tempPayload = {
      id: userAv.id,
      user_identify: userAv.user_identify,
      affiliationVolontaireId: userAv.affiliationVolontaireId
    };
    const token = utility.generateAvToken(tempPayload, { expiresIn: '30m' });

    return res.status(200).json({
      token,
      email: av ? av.email || null : null,
      phone_number: av ? av.phone_number || null : null,
      // Inclus pour les tests mobile (dev) — retirer avant mise en production
      otp_code: otpCode
    });
  } catch (error) {
    console.error('[AV login]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST verify_otp — token temporaire + code
router.post('/verify_otp', utility.otpVerifyTokenAV, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Code OTP requis' });

    const userAv = await UserAffiliationVolontaire.findByPk(req.user.id);
    if (!userAv) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    if (!userAv.otp_secret) {
      userAv.otp_secret = utility2.generateOtpSecret();
      await userAv.save();
    }
    const codeStr = String(code).trim();
    const isValidLoginOtp = await utility.checkLoginOtpAv(userAv.id, codeStr);
    if (!isValidLoginOtp) {
      const isValid = utility2.verifyOtp(codeStr, userAv.otp_secret);
      if (!isValid) {
        return res.status(400).json({ message: 'Code OTP incorrect ou expiré. Réessayez ou demandez un nouveau code.' });
      }
    }

    if (userAv.first_login) {
      const tokenFirstLogin = utility.generateAvToken({
        id: userAv.id,
        user_identify: userAv.user_identify,
        affiliationVolontaireId: userAv.affiliationVolontaireId,
        first_login: true
      });
      return res.status(200).json({
        token: tokenFirstLogin,
        first_login: true,
        message: 'Première connexion. Veuillez changer votre mot de passe.'
      });
    }

    await utility.setSessionAv(userAv.id);
    await userAv.update({ last_connect_time: new Date() });

    const token = utility.generateAvToken({
      id: userAv.id,
      user_identify: userAv.user_identify,
      affiliationVolontaireId: userAv.affiliationVolontaireId
    });

    return res.status(200).json({ token, first_login: false });
  } catch (error) {
    console.error('[AV verify_otp]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST resend_otp
router.post('/resend_otp', utility.otpVerifyTokenAV, async (req, res) => {
  try {
    const userAv = await UserAffiliationVolontaire.findByPk(req.user.id, {
      include: [{ model: AffiliationVolontaire, as: 'affiliationVolontaire', attributes: ['email', 'phone_number'] }]
    });
    if (!userAv) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    if (!userAv.otp_secret) {
      userAv.otp_secret = utility2.generateOtpSecret();
      await userAv.save();
    }
    const otpCode = utility2.generateOtpCode(userAv.otp_secret);
    await utility.setLoginOtpAv(userAv.id, otpCode);
    const av = userAv.affiliationVolontaire;
    if (av && av.email) await utility2.sendOptByMail(otpCode, av.email);
    if (av && av.phone_number) await utility2.sendOptCode(otpCode, av.phone_number);
    return res.status(200).json({ message: 'Code renvoyé' });
  } catch (error) {
    console.error('[AV resend_otp]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// ============================================
// 2. SESSION & DÉCONNEXION
// ============================================

// GET verify_token
router.get('/verify_token', utility.VerifyTokenFlexibleAV, async (req, res) => {
  try {
    const userAv = await UserAffiliationVolontaire.findByPk(req.user.id, {
      include: [{ model: AffiliationVolontaire, as: 'affiliationVolontaire', attributes: ['id', 'nom', 'prenom', 'email', 'phone_number', 'no_immatriculation', 'status'] }]
    });
    if (!userAv) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    await userAv.update({ last_connect_time: new Date() });
    if (utility.isRedisConnected()) await utility.setSessionAv(userAv.id);
    const sanitized = sanitizeAvUser(userAv);
    return res.status(200).json({
      message: 'Token valide',
      user: { ...sanitized, type: 'av', role: 'av' }
    });
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide' });
  }
});

// POST signOut
router.post('/signOut', utility.VerifyTokenFlexibleAV, async (req, res) => {
  try {
    const userId = req.user.id;
    if (utility.isRedisConnected()) await utility.deleteSessionAv(userId);
    return res.status(200).json({ message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('[AV signOut]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// ============================================
// 2b. PAGE ACCUEIL — affiliation du connecté
// ============================================

// GET affiliation — profil complet pour la page d'accueil (protégé AVToken)
router.get('/affiliation', utility.AVToken, async (req, res) => {
  try {
    const affiliationVolontaireId = req.user.affiliationVolontaireId;
    if (!affiliationVolontaireId) {
      return res.status(403).json({ message: 'Affiliation non associée à ce compte' });
    }
    const affiliation = await AffiliationVolontaire.findByPk(affiliationVolontaireId, {
      include: [
        { association: 'branche', attributes: ['id', 'name', 'code'] },
        { association: 'prefecture', attributes: ['id', 'name', 'code'] }
      ]
    });
    if (!affiliation) {
      return res.status(404).json({ message: 'Affiliation volontaire non trouvée' });
    }
    const raw = affiliation.get ? affiliation.get({ plain: true }) : affiliation;
    const branche = raw.branche;
    const prefecture = raw.prefecture;
    const payload = {
      ...raw,
      branche: branche ? { id: branche.id, nom: branche.name, code: branche.code } : null,
      prefecture: prefecture ? { id: prefecture.id, nom: prefecture.name, code: prefecture.code } : null
    };
    return res.status(200).json(payload);
  } catch (error) {
    console.error('[AV GET affiliation]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// ============================================
// 2b-bis. DOCUMENTS — pièces jointes de l'affilié connecté
// ============================================

// GET documents — liste paginée des documents de l'affilié (CNI, photo, certificat de résidence)
router.get('/documents', utility.AVToken, async (req, res) => {
  try {
    const affiliationVolontaireId = req.user.affiliationVolontaireId;
    if (!affiliationVolontaireId) {
      return res.status(403).json({ message: 'Affiliation non associée à ce compte' });
    }

    const affiliation = await AffiliationVolontaire.findByPk(affiliationVolontaireId, {
      attributes: ['id', 'cni_file_path', 'requester_picture', 'certificat_residence_file']
    });
    if (!affiliation) {
      return res.status(404).json({ message: 'Affiliation volontaire non trouvée' });
    }

    const raw = affiliation.get ? affiliation.get({ plain: true }) : affiliation;

    // Construction de la liste des documents disponibles
    const allDocs = [
      { code: 'CNI', label: "Carte Nationale d'Identité", file_path: raw.cni_file_path },
      { code: 'PHOTO', label: 'Photo du demandeur', file_path: raw.requester_picture },
      { code: 'CERTIFICAT_RESIDENCE', label: 'Certificat de résidence', file_path: raw.certificat_residence_file }
    ]
      .filter((d) => !!d.file_path)
      .map((d, index) => ({
        id: index + 1,
        code: d.code,
        label: d.label,
        url: d.file_path,
        type: 'file'
      }));

    // Pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    const totalItems = allDocs.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const data = allDocs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return res.status(200).json({ data, totalItems, totalPages, currentPage, pageSize });
  } catch (error) {
    console.error('[AV GET documents]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// ============================================
// 2b-ter. QUITTANCES — quittances de paiement de l'affilié
// ============================================

const QuittanceAffiliationVolontaire = require('../quittance_affiliation_volontaire/model');

// GET quittances — liste paginée des quittances de l'affilié connecté
router.get('/quittances', utility.AVToken, async (req, res) => {
  try {
    const affiliationVolontaireId = req.user.affiliationVolontaireId;
    if (!affiliationVolontaireId) {
      return res.status(403).json({ message: 'Affiliation non associée à ce compte' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    const offset = (page - 1) * pageSize;

    const { count, rows } = await QuittanceAffiliationVolontaire.findAndCountAll({
      where: { affiliationVolontaireId },
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset
    });

    const data = rows.map((q) => {
      const r = q.get ? q.get({ plain: true }) : q;
      return {
        id: r.id,
        reference: r.reference,
        periode: r.periode,
        year: r.year,
        montant: r.montant,
        payment_method: r.payment_method,
        djomy_transaction_id: r.djomy_transaction_id,
        doc_path: r.doc_path,
        createdAt: r.createdAt
      };
    });

    return res.status(200).json({
      data,
      totalItems: count,
      totalPages: Math.max(1, Math.ceil(count / pageSize)),
      currentPage: page,
      pageSize
    });
  } catch (error) {
    console.error('[AV GET quittances]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// GET quittances/:id/download — génère et retourne le PDF à la volée (rien sur disque)
router.get('/quittances/:id/download', utility.AVToken, async (req, res) => {
  try {
    const affiliationVolontaireId = req.user.affiliationVolontaireId;
    const quittance = await QuittanceAffiliationVolontaire.findOne({
      where: { id: req.params.id, affiliationVolontaireId }
    });
    if (!quittance) return res.status(404).json({ message: 'Quittance non trouvée' });

    const declaration = await DeclarationAffiliationVolontaire.findByPk(quittance.declarationId);
    if (!declaration) return res.status(404).json({ message: 'Déclaration non trouvée' });

    const affiliation = await AffiliationVolontaire.findByPk(affiliationVolontaireId);
    if (!affiliation) return res.status(404).json({ message: 'Affiliation non trouvée' });

    const { generateQuittanceAv } = require('../../services/quittance-av.service');
    const declRaw = declaration.get ? declaration.get({ plain: true }) : declaration;
    const avRaw   = affiliation.get ? affiliation.get({ plain: true }) : affiliation;

    const pdfBuffer = await generateQuittanceAv(declRaw, avRaw, quittance.secret_code);

    const filename = `quittance-${quittance.reference || quittance.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('[AV GET quittance download]', error);
    return res.status(500).json({ message: 'Erreur lors de la génération du PDF' });
  }
});

// ============================================
// 2c. TÉLÉDÉCLARATION — une ligne par mois par affilié (génération automatique)
// ============================================

// GET declarations — génération automatique des déclarations puis liste paginée
router.get('/declarations', utility.AVToken, async (req, res) => {
  try {
    const affiliationVolontaireId = req.user.affiliationVolontaireId;
    if (!affiliationVolontaireId) {
      return res.status(403).json({ message: 'Affiliation non associée à ce compte' });
    }

    const affiliation = await AffiliationVolontaire.findByPk(affiliationVolontaireId);
    if (!affiliation) {
      return res.status(404).json({ message: 'Affiliation volontaire non trouvée' });
    }

    await ensureDeclarationsForAffiliation(affiliationVolontaireId);

    const affRaw = affiliation.get ? affiliation.get({ plain: true }) : affiliation;
    const cotisationAff = Number(affRaw.cotisation) || 0;
    const plafondAff = Number(affRaw.plafond) || 0;
    const revenuAnnuelAff = Number(affRaw.revenu_annuel) || 0;
    const revenuMensuelAff = Number(affRaw.revenu_mensuel) || Math.round(revenuAnnuelAff / 12);

    const toEnsure = getYearMonthList(MONTHS_BACK);
    const key = (y, p) => `${y}-${p}`;
    const list = await DeclarationAffiliationVolontaire.findAll({
      where: { affiliationVolontaireId },
      order: [['year', 'DESC'], ['periode', 'DESC']]
    });
    const byKey = new Map();
    list.forEach((d) => byKey.set(key(d.year, d.periode), d));
    const orderedList = toEnsure.map(({ year, periode }) => byKey.get(key(year, periode))).filter(Boolean);
    const allRows = orderedList.map((d) => {
      const row = d.get ? d.get({ plain: true }) : d;
      // Utilise le montant propre à la déclaration s'il est défini (> 0), sinon celui de l'affiliation
      const montant = Number(row.montant_cotisation) > 0 ? Number(row.montant_cotisation) : cotisationAff;
      const plafond = Number(row.revenu_mensuel) > 0 ? Number(row.revenu_mensuel) : plafondAff;
      const revAnnuel = Number(row.revenu_annuel) > 0 ? Number(row.revenu_annuel) : revenuAnnuelAff;
      const revMensuel = Number(row.revenu_mensuel) > 0 ? Number(row.revenu_mensuel) : revenuMensuelAff;
      return {
        id: row.id,
        periode: row.periode,
        year: row.year,
        montant_cotisation: montant,
        montant_soumis_cotisation: plafond,
        revenu_annuel: revAnnuel,
        revenu_mensuel: revMensuel,
        is_paid: row.is_paid,
        createdAt: row.createdAt
      };
    });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 5));
    const totalItems = allRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const offset = (currentPage - 1) * pageSize;
    const data = allRows.slice(offset, offset + pageSize);

    return res.status(200).json({
      data,
      totalItems,
      totalPages,
      currentPage,
      pageSize
    });
  } catch (error) {
    console.error('[AV GET declarations]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// PATCH declarations/:id/pay — marquer une déclaration comme payée (après paiement effectué ou simulation)
router.patch('/declarations/:id/pay', utility.AVToken, async (req, res) => {
  try {
    const affiliationVolontaireId = req.user.affiliationVolontaireId;
    const id = req.params.id;
    const decl = await DeclarationAffiliationVolontaire.findOne({
      where: { id, affiliationVolontaireId }
    });
    if (!decl) return res.status(404).json({ message: 'Déclaration non trouvée' });
    await decl.update({ is_paid: true });

    // Générer la quittance en arrière-plan
    const { generateQuittanceForDeclaration } = require('../../db/quittance_affiliation_volontaire/generate');
    generateQuittanceForDeclaration(decl.id).catch((e) =>
      console.error('[AV pay] Erreur génération quittance:', e.message)
    );

    const row = decl.get ? decl.get({ plain: true }) : decl;
    return res.status(200).json({
      id: row.id,
      periode: row.periode,
      year: row.year,
      montant_cotisation: row.montant_cotisation,
      is_paid: row.is_paid
    });
  } catch (error) {
    console.error('[AV PATCH declarations pay]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// GET declarations/:id/status — vérification du statut de paiement (polling toutes les 2s côté frontend)
router.get('/declarations/:id/status', utility.AVToken, async (req, res) => {
  try {
    const affiliationVolontaireId = req.user.affiliationVolontaireId;
    const decl = await DeclarationAffiliationVolontaire.findOne({
      where: { id: req.params.id, affiliationVolontaireId }
    });
    if (!decl) return res.status(404).json({ message: 'Déclaration non trouvée' });
    const row = decl.get ? decl.get({ plain: true }) : decl;
    return res.status(200).json({
      id: row.id,
      is_paid: row.is_paid,
      djomy_status: row.djomy_status,
      djomy_transaction_id: row.djomy_transaction_id,
      payment_method: row.payment_method
    });
  } catch (error) {
    console.error('[AV GET declarations status]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// ============================================
// 2d. LENGO PAY – Génération URL de paiement (télédéclaration AV)
// ============================================

const LENGO_BASE_URL = process.env.LENGO_BASE_URL || 'https://portal.lengopay.com';
const LENGO_LICENSE_KEY = process.env.LENGO_LICENSE_KEY || '';
const LENGO_WEBSITE_ID = process.env.LENGO_WEBSITE_ID || '';
const LENGO_RETURN_URL_AV = (process.env.LENGO_RETURN_URL_AV || process.env.LENGO_RETURN_URL || '').trim() || null;
const LENGO_FAILURE_URL_AV = (process.env.LENGO_FAILURE_URL_AV || process.env.LENGO_FAILURE_URL || '').trim() || null;
const LENGO_CALLBACK_URL_AV = (process.env.LENGO_CALLBACK_URL_AV || process.env.LENGO_CALLBACK_URL || '').trim() || null;

/**
 * POST /api/v1/av/auth/lengo_cashin
 * Génère une URL de paiement Lengo Pay pour une déclaration AV (même API Lengo que portail employeur).
 * Body: { amount, declarationId?, currency?, return_url?, failure_url?, callback_url? }
 * Si declarationId fourni, le montant peut être omis (prise depuis la déclaration). Déclaration doit appartenir à l'affilié connecté.
 */
router.post('/lengo_cashin', utility.AVToken, async (req, res) => {
  try {
    const affiliationVolontaireId = req.user.affiliationVolontaireId;
    const { amount, declarationId, currency = 'GNF', return_url, failure_url, callback_url } = req.body;

    let amountVal = amount != null ? (typeof amount === 'number' ? amount : parseFloat(String(amount).trim())) : NaN;
    if (!Number.isFinite(amountVal) || amountVal <= 0) {
      if (declarationId != null) {
        const decl = await DeclarationAffiliationVolontaire.findOne({
          where: { id: declarationId, affiliationVolontaireId }
        });
        if (!decl) return res.status(404).json({ message: 'Déclaration non trouvée' });
        const row = decl.get ? decl.get({ plain: true }) : decl;
        amountVal = Number(row.montant_cotisation) || 0;
      }
    }
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
    else if (LENGO_RETURN_URL_AV) payload.return_url = LENGO_RETURN_URL_AV;
    if (failure_url && typeof failure_url === 'string' && failure_url.startsWith('http')) payload.failure_url = failure_url.trim();
    else if (LENGO_FAILURE_URL_AV) payload.failure_url = LENGO_FAILURE_URL_AV;
    if (callback_url && typeof callback_url === 'string' && callback_url.startsWith('http')) payload.callback_url = callback_url.trim();
    else if (LENGO_CALLBACK_URL_AV) payload.callback_url = LENGO_CALLBACK_URL_AV;

    const authHeader = 'Basic ' + LENGO_LICENSE_KEY.trim();
    const response = await axios.post(LENGO_BASE_URL + '/api/v1/payments', payload, {
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const data = response.data || {};
    const paymentUrl = data.payment_url;
    if (!paymentUrl || typeof paymentUrl !== 'string') {
      return res.status(502).json({ message: 'Réponse Lengo invalide : payment_url absent' });
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
      const httpStatus = status === 401 ? 502 : status === 400 ? 400 : 502;
      return res.status(httpStatus).json({ message: status === 401 ? 'Passerelle de paiement : clé invalide (Lengo Pay)' : (msg || 'Erreur Lengo Pay') });
    }
    console.error('[AV] Lengo cashin error:', err);
    return res.status(500).json({ message: 'Erreur lors de l\'initiation du paiement Lengo Pay' });
  }
});

// ============================================
// 2e. DJOMY – Paiement direct (OM/MOMO) & redirection (autres méthodes)
// ============================================

const djomyService = require('../../services/djomy.service');

// Méthodes avec notification USSD (téléphone obligatoire)
const DJOMY_DIRECT_METHODS = ['OM', 'MOMO'];
// Méthodes avec redirection portail (téléphone non requis)
// const DJOMY_REDIRECT_ONLY_METHODS = ['CARD'];
const DJOMY_REDIRECT_ONLY_METHODS = [];
// Toutes les méthodes valides
const DJOMY_ALL_METHODS = [...DJOMY_DIRECT_METHODS /* , ...DJOMY_REDIRECT_ONLY_METHODS */];

/**
 * POST /api/v1/av/auth/djomy_cashin
 * Initie un paiement via Djomy.
 *
 * — Si paymentMethod = "OM" ou "MOMO" → paiement direct (notification USSD sur le téléphone)
 * — Si paymentMethod = "SOUTRA_MONEY", "PAYCARD" ou "CARD" → redirection vers le portail Djomy
 * — Si paymentMethod absent → redirection avec toutes les méthodes affichées
 *
 * Body: {
 *   phone: "00224XXXXXXXXX",          — numéro du payeur (obligatoire)
 *   declarationId: number,             — ID de la déclaration (obligatoire)
 *   paymentMethod?: string,            — "OM","MOMO","SOUTRA_MONEY","PAYCARD","CARD"
 *   amount?: number,                   — montant (optionnel, déduit de la déclaration)
 *   returnUrl?: string,                — URL de retour https (pour redirection)
 *   cancelUrl?: string                 — URL d'annulation https (pour redirection)
 * }
 */
router.post('/djomy_cashin', utility.AVToken, async (req, res) => {
  try {
    const affiliationVolontaireId = req.user.affiliationVolontaireId;
    const { phone, amount, declarationId, paymentMethod, returnUrl, cancelUrl } = req.body;

    // Validation paymentMethod
    if (!paymentMethod || !DJOMY_ALL_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: `Méthode de paiement invalide. Valeurs acceptées : ${DJOMY_ALL_METHODS.join(', ')}` });
    }

    const isDirectMethod = DJOMY_DIRECT_METHODS.includes(paymentMethod);
    const isRedirectOnly = DJOMY_REDIRECT_ONLY_METHODS.includes(paymentMethod);

    // Normalisation du téléphone — obligatoire pour OM/MOMO, optionnel pour CARD
    let normalizedPhone = '';
    if (!isRedirectOnly) {
      const rawPhone = (phone || '').trim().replace(/\s/g, '');
      if (/^\d{9}$/.test(rawPhone)) {
        normalizedPhone = '00224' + rawPhone;
      } else if (/^00224\d{9}$/.test(rawPhone)) {
        normalizedPhone = rawPhone;
      } else {
        return res.status(400).json({ message: 'Numéro de téléphone invalide. Format attendu : 9 chiffres (ex: 623707722)' });
      }
    }

    const isDirect = isDirectMethod && !isRedirectOnly;

    // Vérifier config Djomy
    if (!djomyService.isConfigured()) {
      return res.status(503).json({ message: 'Paiement Djomy non configuré (DJOMY_CLIENT_ID, DJOMY_CLIENT_SECRET)' });
    }

    // Déclaration obligatoire
    if (declarationId == null) {
      return res.status(400).json({ message: 'declarationId est obligatoire' });
    }

    const decl = await DeclarationAffiliationVolontaire.findOne({
      where: { id: declarationId, affiliationVolontaireId }
    });
    if (!decl) return res.status(404).json({ message: 'Déclaration non trouvée' });
    if (decl.is_paid) return res.status(400).json({ message: 'Cette déclaration est déjà payée' });

    // Résoudre le montant
    let amountVal = amount != null ? (typeof amount === 'number' ? amount : parseFloat(String(amount).trim())) : NaN;
    if (!Number.isFinite(amountVal) || amountVal <= 0) {
      const affiliation = await AffiliationVolontaire.findByPk(affiliationVolontaireId);
      amountVal = Number(affiliation?.cotisation) || Number(decl.montant_cotisation) || 0;
    }
    if (!Number.isFinite(amountVal) || amountVal <= 0) {
      return res.status(400).json({ message: 'Montant invalide' });
    }

    const description = `Cotisation CNSS AV - Déclaration #${declarationId}`;
    let result;

    const hasReturnUrl = !!(returnUrl || process.env.DJOMY_RETURN_URL);

    if (!isRedirectOnly && isDirect && !hasReturnUrl) {
      // ── Paiement direct OM / MOMO (notification USSD, pas de redirection) ──
      result = await djomyService.createDirectPayment({
        paymentMethod,
        payerIdentifier: normalizedPhone,
        amount: Math.round(amountVal),
        description
      });
    } else {
      // ── Paiement avec redirection (CARD toujours, OM/MOMO si returnUrl configuré) ──
      const body = {
        paymentMethod,
        amount: Math.round(amountVal),
        description,
        returnUrl,
        cancelUrl,
        metadata: { declarationId, affiliationVolontaireId }
      };
      if (normalizedPhone) body.payerIdentifier = normalizedPhone;
      result = await djomyService.createRedirectPayment(body);
    }

    // Sauvegarder en BDD
    await decl.update({
      djomy_transaction_id: result.transactionId,
      djomy_merchant_ref: result.merchantPaymentReference,
      djomy_status: result.status || 'CREATED',
      payment_method: paymentMethod ? `DJOMY_${paymentMethod}` : 'DJOMY'
    });

    return res.status(200).json({
      message: isDirect
        ? 'Paiement initié. Validez la transaction sur votre téléphone.'
        : 'Redirection vers le portail de paiement Djomy',
      transactionId: result.transactionId,
      status: result.status,
      redirectUrl: result.redirectUrl || null,
      paymentUrl: result.paymentUrl || null,
      merchantPaymentReference: result.merchantPaymentReference
    });
  } catch (err) {
    console.error('[AV] Djomy cashin error:', err);
    const msg = err.message || 'Erreur lors de l\'initiation du paiement Djomy';
    return res.status(500).json({ message: msg });
  }
});

// ============================================
// 3. MOT DE PASSE OUBLIÉ (immatriculation + OTP)
// ============================================

// POST verify_imma_send_otp — no_immatriculation (sur affiliation_volontaire)
router.post('/verify_imma_send_otp', async (req, res) => {
  try {
    const { immatriculation } = req.body;
    if (!immatriculation) return res.status(400).json({ message: 'Immatriculation requise' });

    const av = await AffiliationVolontaire.findOne({ where: { no_immatriculation: immatriculation.trim() } });
    if (!av) return res.status(400).json({ message: 'Utilisateur non trouvé' });

    const userAv = await UserAffiliationVolontaire.findOne({ where: { affiliationVolontaireId: av.id } });
    if (!userAv) return res.status(400).json({ message: 'Compte de connexion non trouvé' });

    if (!userAv.otp_secret) {
      userAv.otp_secret = utility2.generateOtpSecret();
      await userAv.save();
    }
    const otpCode = utility2.generateOtpCode(userAv.otp_secret);
    if (av.phone_number) await utility2.sendOptCode(otpCode, av.phone_number);
    if (av.email) await utility2.sendOptByMail(otpCode, av.email);

    const token = utility.generateAvToken(
      { id: userAv.id, user_identify: userAv.user_identify, affiliationVolontaireId: userAv.affiliationVolontaireId },
      { expiresIn: '10m' }
    );

    return res.status(200).json({
      user: sanitizeAvUser(userAv),
      email: av.email || null,
      phone_number: av.phone_number || null,
      token
    });
  } catch (error) {
    console.error('[AV verify_imma_send_otp]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST verify_otp_reset — token renvoyé par verify_imma_send_otp + code
router.post('/verify_otp_reset', utility.otpVerifyTokenAV, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Code OTP requis' });

    const userAv = await UserAffiliationVolontaire.findByPk(req.user.id);
    if (!userAv) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    if (!userAv.otp_secret) {
      userAv.otp_secret = utility2.generateOtpSecret();
      await userAv.save();
    }
    const isValid = utility2.verifyOtp(String(code).trim(), userAv.otp_secret);
    if (!isValid) return res.status(400).json({ message: 'Code OTP expiré ou incorrect' });
    return res.status(200).json({ message: 'ok' });
  } catch (error) {
    console.error('[AV verify_otp_reset]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST reset_password_forgot — immatriculation + new_password (après OTP validé côté client)
router.post('/reset_password_forgot', async (req, res) => {
  try {
    const { imma, new_password } = req.body;
    if (!imma || !new_password) {
      return res.status(400).json({ message: 'Immatriculation et nouveau mot de passe requis' });
    }

    const av = await AffiliationVolontaire.findOne({ where: { no_immatriculation: imma.trim() } });
    if (!av) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    const userAv = await UserAffiliationVolontaire.findOne({ where: { affiliationVolontaireId: av.id } });
    if (!userAv) return res.status(404).json({ message: 'Compte non trouvé' });

    const hashedPassword = await utility.hashPassword(new_password);
    await userAv.update({ password: hashedPassword, first_login: false });
    return res.status(200).json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    console.error('[AV reset_password_forgot]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// ============================================
// 4. CHANGEMENT MOT DE PASSE (connecté)
// ============================================

// POST resete_password_first_login — token first_login
router.post('/resete_password_first_login', utility.otpVerifyTokenAV, async (req, res) => {
  try {
    const { user_password, new_password } = req.body;
    if (!user_password || !new_password) {
      return res.status(400).json({ message: 'Ancien et nouveau mot de passe requis' });
    }

    const userAv = await UserAffiliationVolontaire.findByPk(req.user.id);
    if (!userAv) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    const isPasswordValid = await utility.comparePassword(user_password, userAv.password);
    if (!isPasswordValid) return res.status(400).json({ message: 'Ancien mot de passe incorrect' });

    const hashedPassword = await utility.hashPassword(new_password);
    await userAv.update({ password: hashedPassword, first_login: false });
    if (utility.isRedisConnected()) await utility.deleteSessionAv(userAv.id);
    return res.status(200).json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    console.error('[AV resete_password_first_login]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST resete_password (changer MDP une fois connecté — token AV principal)
router.post('/resete_password', utility.AVToken, async (req, res) => {
  try {
    const { password, new_password } = req.body;
    if (!password || !new_password) {
      return res.status(400).json({ message: 'Ancien et nouveau mot de passe requis' });
    }

    const userAv = await UserAffiliationVolontaire.findByPk(req.user.id);
    if (!userAv) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    const isPasswordValid = await utility.comparePassword(password, userAv.password);
    if (!isPasswordValid) return res.status(400).json({ message: 'Ancien mot de passe incorrect' });

    const hashedPassword = await utility.hashPassword(new_password);
    await userAv.update({ password: hashedPassword });
    return res.status(200).json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    console.error('[AV resete_password]', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

module.exports = router;
