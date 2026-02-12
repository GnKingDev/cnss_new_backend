const express = require('express');
const router = express.Router();
const Document = require('./model');
const Employeur = require('../XYemployeurs/model');
const userUtility = require('../users/utility');
const { generateDocumentBuffer } = require('./documentGenerator');

// Error handler wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ============================================
// 1. LISTE DES DOCUMENTS (métadonnées uniquement)
// ============================================

/**
 * GET /api/v1/documents
 * Retourne la liste des documents de l'employeur connecté (métadonnées uniquement, pas de path, pas de contenu binaire).
 * Authentification : EmployeurToken
 * Réponse : { data: [{ id, name, code, employeurId, createdAt, updatedAt }] }
 */
router.get('/', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const employeurId = req.user.user_id;

  const documents = await Document.findAll({
    where: { employeurId },
    attributes: ['id', 'name', 'code', 'employeurId', 'createdAt', 'updatedAt'],
    order: [['createdAt', 'DESC']]
  });

  return res.status(200).json({ data: documents });
}));

// ============================================
// 2. CONTENU DU DOCUMENT (buffer binaire)
// ============================================

/**
 * GET /api/v1/documents/:id/file
 * Retourne le document en buffer binaire (PDF) à la volée.
 * Authentification : EmployeurToken
 * Réponse : Buffer binaire du PDF avec Content-Type: application/pdf
 */
router.get('/:id/file', userUtility.EmployeurToken, asyncHandler(async (req, res) => {
  const documentId = parseInt(req.params.id);
  const employeurId = req.user.user_id;

  // Vérifier que le document existe et appartient à l'employeur connecté
  const document = await Document.findByPk(documentId, {
    include: [
      {
        model: Employeur,
        as: 'employeur',
        attributes: ['id', 'raison_sociale', 'adresse', 'email', 'phone_number', 'no_immatriculation', 'category']
      }
    ]
  });

  if (!document) {
    return res.status(404).json({ message: 'Document non trouvé' });
  }

  // Vérifier que l'employeur connecté a accès à ce document
  if (document.employeurId !== employeurId) {
    return res.status(403).json({ message: 'Accès non autorisé à ce document' });
  }

  // Générer le PDF à la volée
  try {
    const pdfBuffer = await generateDocumentBuffer(document);

    // Définir les headers appropriés
    const filename = document.name ? `${document.name}.pdf` : `document-${document.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');

    // Envoyer le buffer binaire
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Erreur lors de la génération du document:', error);
    return res.status(500).json({ 
      message: 'Erreur lors de la génération du document',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Route error:', error);
  
  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({
      message: 'Erreurs de validation',
      errors: error.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  return res.status(500).json({
    message: 'Erreur interne du serveur',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = router;
