/**
 * Pénalités de retard de paiement — règle métier (cumul linéaire sur le montant initial).
 *
 * - Échéance : paiement au plus tard le **20 du mois suivant** la période déclarée.
 * - Chaque mois de retard après cette échéance : +5 % du montant initial de cotisation (total_branche).
 * - Pas de capitalisation : pénalité totale = montantBase × 0,05 × k (k = mois de retard).
 * - Si paiement enregistré : calcul figé à la date de paiement (plus d’accumulation après).
 */

const { getMonthByName } = require('../cotisation_employeur/utility');

const TAUX_PENALITE_MENSUEL = 0.05;

const TYPE_RETARD_PAIEMENT = 'RETARD_PAIEMENT';

/** Dernier mois du trimestre (0–11) pour dériver l’échéance au 20 du mois suivant. */
const TRIMESTRE_DERNIER_MOIS = {
  T1: 2,
  T2: 5,
  T3: 8,
  T4: 11
};

/**
 * Date limite de paiement : 23:59:59 le 20 du mois suivant la période déclarée.
 * @param {{ periode?: string, trimestre?: string, year: number }} ctx
 * @returns {Date|null}
 */
function dateLimitePaiement(ctx) {
  const { year } = ctx;
  if (year == null || Number.isNaN(Number(year))) return null;

  if (ctx.periode) {
    const mi = getMonthByName(ctx.periode);
    if (!mi) return null;
    let nextMonth = mi.id + 1;
    let y = Number(year);
    if (nextMonth > 11) {
      nextMonth = 0;
      y += 1;
    }
    return new Date(y, nextMonth, 20, 23, 59, 59, 999);
  }

  if (ctx.trimestre) {
    const u = String(ctx.trimestre).toUpperCase().replace(/\s/g, '');
    let lastM = TRIMESTRE_DERNIER_MOIS.T1;
    if (u.startsWith('T4')) lastM = TRIMESTRE_DERNIER_MOIS.T4;
    else if (u.startsWith('T3')) lastM = TRIMESTRE_DERNIER_MOIS.T3;
    else if (u.startsWith('T2')) lastM = TRIMESTRE_DERNIER_MOIS.T2;
    else if (u.startsWith('T1')) lastM = TRIMESTRE_DERNIER_MOIS.T1;
    let nextMonth = lastM + 1;
    let y = Number(year);
    if (nextMonth > 11) {
      nextMonth = 0;
      y += 1;
    }
    return new Date(y, nextMonth, 20, 23, 59, 59, 999);
  }

  return null;
}

/**
 * Nombre de mois de retard k après l’échéance (k ≥ 0).
 * k = 0 si la référence est avant ou à l’échéance.
 * Sinon : nombre de paliers du 20 suivant couverts jusqu’à la date de référence.
 */
function moisRetardApresDeadline(dateLimite, dateReference) {
  const lim = new Date(dateLimite);
  const ref = new Date(dateReference);
  if (ref <= lim) return 0;
  let k = 0;
  const cursor = new Date(lim);
  cursor.setHours(23, 59, 59, 999);
  while (true) {
    cursor.setMonth(cursor.getMonth() + 1);
    cursor.setDate(20);
    cursor.setHours(23, 59, 59, 999);
    k += 1;
    if (ref <= cursor) break;
  }
  return k;
}

function montantPenaliteLineaire(montantBase, k) {
  const B = Number(montantBase) || 0;
  const kk = Math.max(0, Math.floor(Number(k) || 0));
  return Math.round(B * TAUX_PENALITE_MENSUEL * kk);
}

/**
 * @param {object} params
 * @param {number} params.montantBase - total_branche déclaré
 * @param {Date|string} params.dateLimite
 * @param {Date|string} params.dateReference - « aujourd’hui » si impayé, ou date de paiement si payé
 */
function calculerPenaliteRetardPaiement(params) {
  const { montantBase, dateLimite, dateReference } = params;
  if (!dateLimite) {
    return { k: 0, montantPenalite: 0, dateLimitePaiement: null };
  }
  const lim = new Date(dateLimite);
  const ref = new Date(dateReference);
  const k = moisRetardApresDeadline(lim, ref);
  return {
    k,
    montantPenalite: montantPenaliteLineaire(montantBase, k),
    dateLimitePaiement: lim
  };
}

/**
 * Aperçu pour une déclaration / facture (date de référence = maintenant par défaut).
 */
function previewPenalitePourPeriode(ctx, montantBase, dateReference = new Date()) {
  const dateLimite = dateLimitePaiement(ctx);
  return calculerPenaliteRetardPaiement({
    montantBase,
    dateLimite,
    dateReference
  });
}

module.exports = {
  TAUX_PENALITE_MENSUEL,
  TYPE_RETARD_PAIEMENT,
  dateLimitePaiement,
  moisRetardApresDeadline,
  montantPenaliteLineaire,
  calculerPenaliteRetardPaiement,
  previewPenalitePourPeriode
};
