const express = require('express');
const router = express.Router();
const Quittance = require('./model');

/**
 * Module `db/quittance/route.js` – Vérification et authentification des quittances
 * 
 * Ce module gère la vérification et l'authentification des quittances de paiement de cotisations sociales.
 * Les quittances sont créées automatiquement lors de la validation d'un paiement.
 * 
 * Base path: /api/v1/quittance
 */

/**
 * POST /api/v1/quittance/verify_reference
 * 
 * Vérifie l'authenticité d'une quittance en utilisant sa référence.
 * Route publique permettant à des tiers de valider l'authenticité d'un document.
 * 
 * Body (JSON):
 * {
 *   "reference": "1204123100400202501"
 * }
 * 
 * Réponses:
 * - 200: Référence valide
 * - 400: Référence invalide ou manquante
 * - 500: Erreur serveur
 */
router.post('/verify_reference', async (req, res) => {
  try {
    // Validation des entrées
    if (!req.body.reference) {
      return res.status(400).json({ 
        message: 'Référence manquante',
        valid: false
      });
    }

    if (typeof req.body.reference !== 'string') {
      return res.status(400).json({ 
        message: 'Format de référence invalide',
        valid: false
      });
    }

    const reference = req.body.reference.trim();

    // Validation du format (optionnel mais recommandé)
    // Format attendu: numéro d'immatriculation + période + type (minimum 10 caractères)
    if (reference.length < 10 || !/^[A-Z0-9]+$/i.test(reference)) {
      return res.status(400).json({ 
        message: 'Format de référence invalide',
        valid: false
      });
    }

    // Recherche de la quittance
    const quittance = await Quittance.findOne({
      where: { reference: reference },
      attributes: ['reference', 'createdAt', 'doc_path'] // Ne pas exposer le secret_code
    });

    if (quittance) {
      // Logger la vérification réussie
      console.log(`[QUITTANCE_VERIFY] Reference ${reference} verified at ${new Date().toISOString()}`);

      return res.status(200).json({
        message: 'Reference verifier',
        valid: true,
        createdAt: quittance.createdAt
      });
    } else {
      // Logger la vérification échouée
      console.log(`[QUITTANCE_VERIFY] Reference ${reference} not found at ${new Date().toISOString()}`);

      return res.status(400).json({ 
        message: 'Document non authentifié',
        valid: false
      });
    }
  } catch (error) {
    console.error('[QUITTANCE_VERIFY] Error:', error);
    return res.status(500).json({ 
      message: 'Erreur, veuillez réessayer plus tard',
      valid: false
    });
  }
});

/**
 * POST /api/v1/quittance/secret_code
 * 
 * Récupère les détails complets d'une quittance en utilisant son code secret.
 * Route publique permettant une vérification détaillée avec toutes les informations.
 * 
 * Body (JSON):
 * {
 *   "secret_code": "ABC123XYZ"
 * }
 * 
 * Réponses:
 * - 200: Quittance trouvée avec détails
 * - 400: Code secret invalide ou manquant
 * - 500: Erreur serveur
 */
router.post('/secret_code', async (req, res) => {
  try {
    // Validation des entrées
    if (!req.body.secret_code) {
      return res.status(400).json({ 
        message: 'Code secret manquant',
        valid: false
      });
    }

    if (typeof req.body.secret_code !== 'string') {
      return res.status(400).json({ 
        message: 'Format de code secret invalide',
        valid: false
      });
    }

    const secretCode = req.body.secret_code.trim();

    // Validation de la longueur minimale
    if (secretCode.length < 8) {
      return res.status(400).json({ 
        message: 'Code secret invalide',
        valid: false
      });
    }

    // Recherche de la quittance avec relations
    const quittance = await Quittance.findOne({
      where: { secret_code: secretCode },
      include: [
        {
          association: 'employeur',
          attributes: ['raison_sociale', 'no_immatriculation', 'adresse'] // Limiter les champs exposés
        },
        {
          association: 'cotisation_employeur',
          attributes: ['periode', 'year', 'total_branche', 'motif', 'trimestre'] // Limiter les champs exposés
        }
      ]
    });

    if (quittance) {
      // Logger l'accès
      console.log(`[QUITTANCE_SECRET] Secret code accessed at ${new Date().toISOString()}`);

      // Format de réponse amélioré (ne pas exposer toutes les données sensibles)
      return res.status(200).json({
        reference: quittance.reference,
        doc_path: quittance.doc_path,
        createdAt: quittance.createdAt,
        employeur: quittance.employeur ? {
          raison_sociale: quittance.employeur.raison_sociale,
          no_immatriculation: quittance.employeur.no_immatriculation,
          adresse: quittance.employeur.adresse
        } : null,
        cotisation: quittance.cotisation_employeur ? {
          periode: quittance.cotisation_employeur.periode,
          year: quittance.cotisation_employeur.year,
          trimestre: quittance.cotisation_employeur.trimestre,
          total_branche: quittance.cotisation_employeur.total_branche,
          motif: quittance.cotisation_employeur.motif
        } : null
      });
    } else {
      // Logger la tentative échouée
      console.log(`[QUITTANCE_SECRET] Invalid secret code attempted at ${new Date().toISOString()}`);

      return res.status(400).json({ 
        message: 'Code secret invalide',
        valid: false
      });
    }
  } catch (error) {
    console.error('[QUITTANCE_SECRET] Error:', error);
    return res.status(500).json({ 
      message: 'Erreur, veuillez réessayer plus tard',
      valid: false
    });
  }
});

module.exports = router;
