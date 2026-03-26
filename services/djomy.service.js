/**
 * Service Djomy — Authentification HMAC-SHA256 + paiement direct & redirection.
 *
 * Variables d'environnement requises :
 *   DJOMY_CLIENT_ID, DJOMY_CLIENT_SECRET
 *   DJOMY_AUTH_URL       (défaut : https://api.djomy.africa/v1/auth)
 *   DJOMY_PAYMENT_URL    (défaut : https://api.djomy.africa/v1/payments)
 *   DJOMY_RETURN_URL     — URL de retour après paiement (https, obligatoire pour redirection)
 *   DJOMY_CANCEL_URL     — URL si l'utilisateur annule (optionnel)
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const DJOMY_CLIENT_ID     = () => process.env.DJOMY_CLIENT_ID || '';
const DJOMY_CLIENT_SECRET = () => process.env.DJOMY_CLIENT_SECRET || '';
const DJOMY_AUTH_URL       = () => process.env.DJOMY_AUTH_URL || 'https://api.djomy.africa/v1/auth';
const DJOMY_PAYMENT_URL    = () => process.env.DJOMY_PAYMENT_URL || 'https://api.djomy.africa/v1/payments';
const DJOMY_RETURN_URL     = () => (process.env.DJOMY_RETURN_URL || '').trim() || null;
const DJOMY_CANCEL_URL     = () => (process.env.DJOMY_CANCEL_URL || '').trim() || null;
const DJOMY_PARTNER_DOMAIN = () => process.env.DJOMY_PARTNER_DOMAIN || '';

// ─── Helpers ───

/** Génère la signature HMAC-SHA256 (clientId signé avec clientSecret). */
function generateSignature() {
  return crypto
    .createHmac('sha256', DJOMY_CLIENT_SECRET())
    .update(DJOMY_CLIENT_ID())
    .digest('hex');
}

/** Headers d'authentification Djomy. */
async function getAuthHeaders() {
  const clientId = DJOMY_CLIENT_ID();
  const signature = generateSignature();

  const response = await fetch(DJOMY_AUTH_URL(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': `${clientId}:${signature}`,
      'X-PARTNER-DOMAIN': DJOMY_PARTNER_DOMAIN()
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Erreur auth Djomy (${response.status}): ${text}`);
  }

  const data = JSON.parse(await response.text());
  const accessToken = data?.data?.accessToken;
  if (!accessToken) {
    throw new Error('Pas de accessToken dans la réponse Djomy');
  }

  return {
    'Content-Type': 'application/json',
    'X-API-KEY': `${clientId}:${signature}`,
    'Authorization': `Bearer ${accessToken}`,
    'X-PARTNER-DOMAIN': DJOMY_PARTNER_DOMAIN()
  };
}

/** Appelle POST /v1/payments et parse la réponse. */
async function callPaymentApi(body) {
  const headers = await getAuthHeaders();

  const response = await fetch(DJOMY_PAYMENT_URL(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Erreur paiement Djomy (${response.status}): ${text}`);
  }

  const result = await response.json();
  const data = result?.data || {};

  if (!data.transactionId) {
    throw new Error('Pas de transactionId dans la réponse Djomy');
  }

  return {
    transactionId: data.transactionId,
    status: data.status,
    paidAmount: data.paidAmount,
    paymentMethod: data.paymentMethod,
    merchantPaymentReference: data.merchantPaymentReference,
    createdAt: data.createdAt,
    redirectUrl: data.redirectUrl,
    paymentUrl: data.paymentUrl,
  };
}

// ─── Paiement direct (OM / MOMO) — notification USSD sur le téléphone ───

/**
 * @param {Object} params
 * @param {string} params.paymentMethod  — "OM" ou "MOMO"
 * @param {string} params.payerIdentifier — Numéro au format 00224XXXXXXXXX
 * @param {number} params.amount          — Montant en GNF
 * @param {string} [params.description]
 */
async function createDirectPayment({ paymentMethod, payerIdentifier, amount, description }) {
  const merchantPaymentReference = uuidv4();

  const body = {
    paymentMethod,
    payerIdentifier,
    amount,
    countryCode: 'GN',
    description: description || 'Cotisation CNSS - Affiliation Volontaire',
    merchantPaymentReference,
  };

  const result = await callPaymentApi(body);
  return { ...result, merchantPaymentReference: result.merchantPaymentReference || merchantPaymentReference };
}

// ─── Paiement avec redirection vers le portail Djomy ───

/**
 * @param {Object} params
 * @param {number} params.amount
 * @param {string} params.payerNumber                — Numéro au format 00224XXXXXXXXX
 * @param {string[]} [params.allowedPaymentMethods]  — Ex: ["SOUTRA_MONEY","PAYCARD","CARD"]
 * @param {string} [params.description]
 * @param {string} [params.returnUrl]
 * @param {string} [params.cancelUrl]
 * @param {object} [params.metadata]
 */
async function createRedirectPayment({ amount, payerNumber, allowedPaymentMethods, description, returnUrl, cancelUrl, metadata }) {
  const merchantPaymentReference = uuidv4();

  const body = {
    amount,
    countryCode: 'GN',
    payerNumber,
    merchantPaymentReference,
  };

  if (Array.isArray(allowedPaymentMethods) && allowedPaymentMethods.length > 0) {
    body.allowedPaymentMethods = allowedPaymentMethods;
  }

  if (description) {
    body.description = String(description).slice(0, 255);
  }

  const finalReturnUrl = returnUrl || DJOMY_RETURN_URL();
  if (finalReturnUrl) body.returnUrl = finalReturnUrl;

  const finalCancelUrl = cancelUrl || DJOMY_CANCEL_URL();
  if (finalCancelUrl) body.cancelUrl = finalCancelUrl;

  if (metadata && typeof metadata === 'object') {
    body.metadata = metadata;
  }

  const result = await callPaymentApi(body);
  return { ...result, merchantPaymentReference: result.merchantPaymentReference || merchantPaymentReference };
}

/** Vérifie que les credentials Djomy sont configurés. */
function isConfigured() {
  return !!(DJOMY_CLIENT_ID() && DJOMY_CLIENT_SECRET());
}

module.exports = { generateSignature, createDirectPayment, createRedirectPayment, isConfigured };
