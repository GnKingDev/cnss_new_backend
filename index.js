const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Dossier des PDFs (factures, quittances, etc.) — contenu servi sous /api/v1/docsx/
const docPath = path.join(__dirname, 'document/docs');
// Photos / avatars employés — GET /uploads/xxx
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });

// Middleware (limite JSON augmentée pour PATCH famille avec photos en base64)
app.use(morgan('tiny'));
app.use(cors());
// Pour PATCH .../famille et POST/PATCH .../prestations/demandes en multipart, ne pas parser le body : Multer le fera
const isMultipartFamille = (req) => req.method === 'PATCH' && req.originalUrl.includes('/famille') &&
  req.headers['content-type'] && String(req.headers['content-type']).startsWith('multipart/form-data');
const isMultipartPrestation = (req) => (req.method === 'POST' || req.method === 'PATCH') && req.originalUrl.includes('/prestations/demandes') &&
  req.headers['content-type'] && String(req.headers['content-type']).startsWith('multipart/form-data');
const isMultipartReclamation = (req) => req.method === 'POST' && req.originalUrl.includes('/reclamation/demandes') &&
  req.headers['content-type'] && String(req.headers['content-type']).startsWith('multipart/form-data');
const skipBodyParse = (req) => isMultipartFamille(req) || isMultipartPrestation(req) || isMultipartReclamation(req);
app.use((req, res, next) => {
  if (skipBodyParse(req)) return next();
  bodyParser.json({ limit: '10mb' })(req, res, next);
});
app.use((req, res, next) => {
  if (skipBodyParse(req)) return next();
  bodyParser.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
});
app.use('/uploads', express.static(uploadsPath));

// Import database connection
const sequelize = require('./db/db.connection');

// Initialize all model relations
require('./db/relations');

// Import routes
const paysRoutes = require('./db/pays/route');
const prefectureRoutes = require('./db/prefecture/route');
const activityRoutes = require('./db/domain_activite/route');
const brancheRoutes = require('./db/branches/route');
const banqueRoutes = require('./db/banques/route');
const usersRoutes = require('./db/users/route');
const requestEmployeurRoutes = require('./db/request_employeur/route');
const employeurRoutes = require('./db/XYemployeurs/route');
const employeRoutes = require('./db/employe/route');
const { cotisation_emplyeur_router: cotisationEmployeurRoutes } = require('./db/cotisation_employeur/route.full');
const declarationEmployeRoutes = require('./db/declaration-employe/route');
const paiementRoutes = require('./db/paiement/route');
const quittanceRoutes = require('./db/quittance/route');
const penaliteRoutes = require('./db/penalites/route');
const demandeRoutes = require('./db/demandes/route');
const carriereRoutes = require('./db/carriere/route');
const conjointRoutes = require('./db/conjoint/route');
const enfantRoutes = require('./db/enfant/route');
const documentRoutes = require('./db/document/route');
const otpRoutes = require('./db/otp/route');
const excelFileRoutes = require('./db/excel_file/route');
const quitusRoutes = require('./db/quitus/route');
const succursaleRoutes = require('./db/succursale/route');
const dirgaUserRoutes = require('./db/dirga_user/route');
const adhesionRoutes = require('./db/adhesion/route');
const affiliationVolontaireRoutes = require('./db/affiliation-volontaire/route');
const prestationRoutes = require('./db/prestation/route');
const biometrieRoutes = require('./db/biometrie/route');
const reclamationRoutes = require('./db/reclamation/route');

// API Routes
app.use('/api/pays', paysRoutes);
app.use('/api/v1/prefecture', prefectureRoutes); // Updated to match documentation
app.use('/api/prefectures', prefectureRoutes); // Keep for backward compatibility
app.use('/api/activities', activityRoutes);
app.use('/api/branches', brancheRoutes);
app.use('/api/banques', banqueRoutes);
app.use('/api/v1/user', usersRoutes); // Updated to match documentation
app.use('/api/users', usersRoutes); // Keep for backward compatibility
app.use('/api/v1/employeur', employeurRoutes); // Updated to match documentation
app.use('/api/request-employeur', requestEmployeurRoutes);
app.use('/api/employeurs', employeurRoutes);
app.use('/api/v1/employe', employeRoutes); // Updated to match documentation
app.use('/api/employes', employeRoutes); // Keep for backward compatibility
app.use('/api/cotisations-employeur', cotisationEmployeurRoutes);
app.use('/api/v1/cotisation_employeur', cotisationEmployeurRoutes); // alias pour employe_list, declare-periode, etc.
app.use('/api/declarations-employe', declarationEmployeRoutes);
app.use('/api/v1/paiement', paiementRoutes.router || paiementRoutes);
app.use('/api/paiements', paiementRoutes.router || paiementRoutes);
app.use('/api/v1/quittance', quittanceRoutes); // Updated to match documentation
app.use('/api/quittances', quittanceRoutes); // Keep for backward compatibility
app.use('/api/penalites', penaliteRoutes);
app.use('/api/v1/demande', demandeRoutes); // Updated to match documentation
app.use('/api/demandes', demandeRoutes); // Keep for backward compatibility
app.use('/api/carrieres', carriereRoutes);
app.use('/api/conjoints', conjointRoutes);
app.use('/api/enfants', enfantRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/v1/documents', documentRoutes); // Route selon spécifications
app.use('/api/otp', otpRoutes);
app.use('/api/excel-files', excelFileRoutes);
app.use('/api/quitus', quitusRoutes);
app.use('/api/succursales', succursaleRoutes);
app.use('/api/v1/dirga', dirgaUserRoutes); // Updated to match documentation
app.use('/api/dirga-users', dirgaUserRoutes); // Keep for backward compatibility
app.use('/api/adhesions', adhesionRoutes);
app.use('/api/affiliations-volontaires', affiliationVolontaireRoutes);
app.use('/api/v1/prestations', prestationRoutes);
app.use('/api/v1/biometrie', biometrieRoutes);
app.use('/api/v1/reclamation', reclamationRoutes);

// Servir les PDFs depuis document/docs — GET /api/v1/docsx/:filename.pdf
app.get('/api/v1/docsx/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!filename || !filename.endsWith('.pdf')) {
    return res.status(400).json({ message: 'Nom de fichier PDF invalide' });
  }
  if (filename.includes('..')) {
    return res.status(400).json({ message: 'Nom de fichier invalide' });
  }
  const filePath = path.join(docPath, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Document non trouvé' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
  res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  res.sendFile(filePath);
});

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'CNSS Backend API',
    status: 'running',
    version: '1.0.0'
  });
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ 
      status: 'healthy',
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
