const express = require('express');
const router = express.Router();
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');
const AffiliationVolontaire = require('../affiliation-volontaire/model');
const DemandeAccesEmploye = require('../demande-acces-employe/model');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `acces-employe-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * GET /api/v1/public/stats
 * Statistiques publiques pour la landing page — sans authentification.
 */
router.get('/stats', async (req, res) => {
  try {
    const [totalEmployeurs, totalEmployes, totalAV] = await Promise.all([
      Employeur.count({ where: { is_immatriculed: true } }),
      Employe.count({ where: { is_imma: true } }),
      AffiliationVolontaire.count(),
    ]);

    return res.json({
      total_employeurs: totalEmployeurs,
      total_employes: totalEmployes,
      total_av: totalAV,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/v1/public/demande-acces-employe
 * Demande d'accès eCNSS pour un employé immatriculé — sans authentification.
 */
router.post('/demande-acces-employe', upload.single('piece_identite'), async (req, res) => {
  try {
    const { no_immatriculation, prenom, nom, email, telephone, raison_sociale_employeur } = req.body;

    if (!no_immatriculation || !prenom || !nom || !email || !telephone || !raison_sociale_employeur) {
      return res.status(400).json({ message: 'Tous les champs obligatoires doivent être renseignés' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Pièce d\'identité requise' });
    }

    // Vérifier que l'employé existe par matricule
    const employe = await Employe.findOne({ where: { matricule: no_immatriculation.trim() } });
    if (!employe) {
      return res.status(404).json({ message: 'Aucun assuré trouvé avec ce numéro d\'immatriculation' });
    }

    // Générer une référence unique
    const reference = `ACC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    // Enregistrer la demande en base
    const demande = await DemandeAccesEmploye.create({
      reference,
      no_immatriculation: no_immatriculation.trim(),
      prenom: prenom.trim(),
      nom: nom.trim(),
      email: email.trim(),
      telephone: telephone.trim(),
      raison_sociale_employeur: raison_sociale_employeur.trim(),
      piece_identite_path: req.file.path,
      statut: 'en_attente',
      employeId: employe.id,
    });

    return res.status(201).json({
      message: 'Demande enregistrée avec succès',
      reference: demande.reference,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
