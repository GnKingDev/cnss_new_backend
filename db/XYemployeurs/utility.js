const Employeur = require('./model');
const Users = require('../users/model');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const DirgaU = require('../dirga_user/model');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Allowed file types
const ALLOWED_FILE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/jpg': ['.jpg'],
  'application/pdf': ['.pdf']
};

// File size limit: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = Object.keys(ALLOWED_FILE_TYPES);
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé. Types acceptés: ${allowedMimeTypes.join(', ')}`), false);
  }
};

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    const name = path.basename(file.originalname, ext)
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .substring(0, 50); // Limit filename length
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10 // Max 10 files total
  }
});

// File array for employeur submission
const fileArray = [
  { name: 'cni', maxCount: 1 },
  { name: 'requester_picture', maxCount: 1 },
  { name: 'rccm_file', maxCount: 1 },
  { name: 'dni_file', maxCount: 1 },
  { name: 'logo', maxCount: 1 },
  { name: 'DPAE_file', maxCount: 1 }
];

const utility = {
  findByRaisonSociale: async (raison_sociale) => {
    return await Employeur.findOne({ where: { raison_sociale } });
  },

  findByNoImmatriculation: async (no_immatriculation) => {
    return await Employeur.findOne({ where: { no_immatriculation } });
  },

  findByEmail: async (email) => {
    return await Employeur.findOne({ where: { email } });
  },

  // Multer upload middleware
  upload: upload,
  fileArray: fileArray,

  // Get Paylican token
  getPaylicanToken: async () => {
    try {
      if (!process.env.PAYLICAN_API_URL || !process.env.PAYLICAN_CLIENT_ID || !process.env.PAYLICAN_CLIENT_SECRET) {
        console.warn('Paylican credentials not configured');
        return null;
      }

      const response = await axios.post(`${process.env.PAYLICAN_API_URL}/auth/token`, {
        client_id: process.env.PAYLICAN_CLIENT_ID,
        client_secret: process.env.PAYLICAN_CLIENT_SECRET
      });
      return response.data.access_token;
    } catch (error) {
      console.error('Error getting Paylican token:', error);
      return null;
    }
  },

  // Add user to Paylican
  addingUserPaylican: async (user, Employeur) => {
    try {
      const token = await utility.getPaylicanToken();
      if (!token) {
        console.warn('Cannot add user to Paylican: no token');
        return false;
      }

      await axios.post(
        `${process.env.PAYLICAN_API_URL}/users/delegate`,
        {
          username: user.identity,
          email: user.email,
          phone: user.phone_number,
          first_name: user.first_name,
          last_name: user.last_name,
          employer_id: Employeur.no_immatriculation
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return true;
    } catch (error) {
      console.error('Error adding user to Paylican:', error);
      return false;
    }
  },

  // Delete delegate user from Paylican
  DeleteDelegateUser: async (username) => {
    try {
      const token = await utility.getPaylicanToken();
      if (!token) {
        console.warn('Cannot delete user from Paylican: no token');
        return false;
      }

      await axios.delete(
        `${process.env.PAYLICAN_API_URL}/users/delegate/${username}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      return true;
    } catch (error) {
      console.error('Error deleting user from Paylican:', error);
      return false;
    }
  },

  // Verify token for DIRGA/Admin
  verifyToken: async (req, res, next) => {
    try {
      const authHeader = req.get('Authorization');
      if (!authHeader) {
        return res.status(401).json({ message: 'Erreur authentification' });
      }

      const token = authHeader.split(' ')[1] || authHeader;
      const decoded = jwt.verify(token, process.env.EMPLOYEUR_KEY || 'your-secret-key');

      // Verify DIRGA user
      const dirgaUser = await DirgaU.findByPk(decoded.id);
      if (!dirgaUser || !dirgaUser.can_work) {
        return res.status(401).json({ message: 'Erreur authentification' });
      }

      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Token invalide' });
    }
  },

  // Validate email function
  valideEmailFunction: async (email, type) => {
    const { Op } = require('sequelize');
    const Employe = require('../employe/model');
    const RequestEmployeur = require('../request_employeur/model');

    const existing = await Employe.findOne({ where: { email } }) ||
                     await Employeur.findOne({ where: { email } }) ||
                     await RequestEmployeur.findOne({ where: { email } });

    if (existing) {
      if (type === 'requester') {
        throw new Error('Cet email dans information du demandeur existe déjà');
      } else if (type === 'employeur') {
        throw new Error('Cet email dans coordonnées et activitée existe déjà');
      } else {
        throw new Error('email existant');
      }
    }
    return 'ok';
  },

  // Validate phone number
  ValidatePhoneNumber: async (phone_number, type) => {
    const { Op } = require('sequelize');
    const Employe = require('../employe/model');
    const RequestEmployeur = require('../request_employeur/model');

    const existing = await Employe.findOne({ where: { phone_number } }) ||
                     await Employeur.findOne({ where: { phone_number } }) ||
                     await RequestEmployeur.findOne({ where: { phone_number } });

    if (existing) {
      if (type === 'requester') {
        throw new Error('Ce numéro de télephone dans information demandeur existe déjà');
      } else {
        throw new Error('Ce numéro de téléphone dans coordonnées et activitée existe déjà');
      }
    }
    return 'ok';
  },

  // Generate unique code
  generateUniqueCode: (length = 9) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
};

module.exports = utility;
