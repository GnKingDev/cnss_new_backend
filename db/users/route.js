const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const Users = require('./model');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');
const utility = require('./utility');
const utility2 = require('./utility2');
const employeurUtility = require('../XYemployeurs/utility');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const EMPLOYEUR_KEY = process.env.EMPLOYEUR_KEY || process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '3h';

// Helper: Remove sensitive data from user object
const sanitizeUser = (user) => {
  if (!user) return null;
  const { password, email, phone_number, otp_secret, ...sanitized } = user;
  return sanitized;
};

// Helper: Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      identity: user.identity,
      role: user.role,
      user_identify: user.user_identify,
      user_id: user.user_id
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Helper: Generate identity for sub-accounts
const generateIdentity = async (role, user_identify) => {
  const prefix = role === 'Payeur' ? 'P' : 'R';
  const lastUser = await Users.findOne({
    where: {
      user_identify: user_identify,
      identity: { [Op.like]: `${prefix}%` }
    },
    order: [['createdAt', 'DESC']],
    raw: true
  });

  let nextNumber = 1;
  if (lastUser && lastUser.identity) {
    const match = lastUser.identity.match(/\d+$/);
    if (match) {
      nextNumber = parseInt(match[0]) + 1;
    }
  }

  return `${prefix}${nextNumber}`;
};

// Helper: Parse pagination parameters from query
const getPaginationParams = (req) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  // Validate pagination params
  const validPage = page > 0 ? page : 1;
  const validLimit = limit > 0 && limit <= 100 ? limit : 10; // Max 100 items per page
  const validOffset = (validPage - 1) * validLimit;
  
  return {
    page: validPage,
    limit: validLimit,
    offset: validOffset
  };
};

// Helper: Format paginated response
const formatPaginatedResponse = (data, total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
};

// ============================================
// 1. LOGIN & AUTHENTIFICATION (avec OTP)
// ============================================

// POST /api/v1/user/login
router.post('/login', async (req, res) => {
  try {
    const { user_identify, password } = req.body;

    if (!user_identify || !password) {
      return res.status(400).json({ message: 'Identifiant et mot de passe requis' });
    }

    // Find user by identity
    const user = await Users.findOne({ where: { identity: user_identify }, raw: true });

    if (!user) {
      return res.status(400).json({ message: 'Mot de passe ou identification incorrecte' });
    }

    if (!user.can_work) {
      return res.status(400).json({ message: 'Mot de passe ou identification incorrecte' });
    }

    // Verify password
    const isPasswordValid = await utility.comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Mot de passe ou identification incorrecte' });
    }

    // If employer, send OTP
    if (user.role === 'employeur') {
      // Get user instance (not raw) to update otp_secret if needed
      const userInstance = await Users.findByPk(user.id);
      console.log('[login] employeur identity:', user.identity, '| has otp_secret:', !!userInstance.otp_secret);

      // Generate OTP secret if user doesn't have one
      if (!userInstance.otp_secret) {
        userInstance.otp_secret = utility2.generateOtpSecret();
        await userInstance.save();
        console.log('[login] nouvel otp_secret généré pour', user.identity);
      }

      // Generate OTP code using user's secret
      const otpCode = utility2.generateOtpCode(userInstance.otp_secret);
      console.log('[login] OTP généré pour', user.identity, '| code (debug):', otpCode, '| envoi email:', !!user.email, '| envoi SMS:', !!user.phone_number);

      // Stocker le code 5 min en Redis pour verify_otp (évite refus si délai TOTP)
      await utility.setLoginOtp(user.id, otpCode);

      // Send OTP by email
      if (user.email) {
        await utility2.sendOptByMail(otpCode, user.email);
      }

      // Send OTP by SMS
      if (user.phone_number) {
        await utility2.sendOptCode(otpCode, user.phone_number);
      }

      // Generate temporary token (30 min)
      const tempUser = sanitizeUser(user);
      const token = jwt.sign(tempUser, JWT_SECRET, { expiresIn: '30m' });

      return res.status(200).json({
        token,
        email: user.email || null,
        phone_number: user.phone_number || null
      });
    }

    // For other roles, generate token directly
    const sanitizedUser = sanitizeUser(user);
    const token = generateToken(user);

    // Create Redis session
    await utility.setSession(user.id);

    return res.status(200).json({
      token,
      email: user.email || null,
      phone_number: user.phone_number || null
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST /api/v1/user/verify_otp
router.post('/verify_otp', utility.otpVerifyToken, async (req, res) => {
  try {
    const { code } = req.body;
    console.log('[verify_otp] body reçu:', JSON.stringify(req.body), '| code (type):', typeof code, '| code (value):', code);
    console.log('[verify_otp] user depuis token:', req.user?.identity);

    if (!code) {
      console.log('[verify_otp] 400: code manquant dans le body');
      return res.status(400).json({ message: 'Code OTP requis' });
    }

    // Get user with otp_secret
    const user = await Users.findOne({ where: { identity: req.user.identity } });
    if (!user) {
      console.log('[verify_otp] 404: user non trouvé identity=', req.user.identity);
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    console.log('[verify_otp] user trouvé id=', user.id, '| has otp_secret:', !!user.otp_secret);

    // Generate OTP secret if user doesn't have one
    if (!user.otp_secret) {
      user.otp_secret = utility2.generateOtpSecret();
      await user.save();
      console.log('[verify_otp] otp_secret était absent, nouveau généré (code précédent ne matchera plus)');
    }

    const codeStr = String(code).trim();
    // 1) Accepter le code envoyé au login (stocké 5 min en Redis) — évite refus si délai TOTP
    const isValidLoginOtp = await utility.checkLoginOtp(user.id, codeStr);
    if (isValidLoginOtp) {
      console.log('[verify_otp] code validé via otp:login (Redis)');
    } else {
      // 2) Sinon vérifier TOTP (fenêtre ~90 s)
      const isValid = utility2.verifyOtp(codeStr, user.otp_secret);
      console.log('[verify_otp] code vérifié TOTP:', codeStr, '| isValid:', isValid);
      if (!isValid) {
        return res.status(400).json({ message: 'Code OTP incorrect ou expiré. Réessayez ou demandez un nouveau code.' });
      }
    }

    // Flux first_login (changement mot de passe) : token JWT_SECRET, utilisé uniquement pour resete_password_first_login et verify_token sur /first-login.
    if (user.first_login) {
      const tokenFirstLogin = jwt.sign(
        {
          id: user.id,
          identity: user.identity,
          role: user.role,
          user_identify: user.user_identify,
          user_id: user.user_id,
          first_login: true
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      return res.status(200).json({
        token: tokenFirstLogin,
        first_login: true,
        message: 'Première connexion. Veuillez changer votre mot de passe.'
      });
    }

    await utility.setSession(user.id);

    // Token employeur (EMPLOYEUR_KEY, 3h) pour le reste de l'app.
    const token = jwt.sign(
      {
        id: user.id,
        identity: user.identity,
        role: user.role,
        user_identify: user.user_identify,
        user_id: user.user_id
      },
      EMPLOYEUR_KEY,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      token,
      first_login: false
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST /api/v1/user/resend_otp — protégé par le token temporaire (même JWT que verify_otp)
router.post('/resend_otp', utility.otpVerifyToken, async (req, res) => {
  try {
    const user = await Users.findOne({ where: { identity: req.user.identity } });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (!user.otp_secret) {
      user.otp_secret = utility2.generateOtpSecret();
      await user.save();
    }

    const otpCode = utility2.generateOtpCode(user.otp_secret);
    await utility.setLoginOtp(user.id, otpCode);

    if (user.email) {
      await utility2.sendOptByMail(otpCode, user.email);
    }
    if (user.phone_number) {
      await utility2.sendOptCode(otpCode, user.phone_number);
    }

    return res.status(200).json({ message: 'Code renvoyé' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST /api/v1/user/verify_imma_send_otp
router.post('/verify_imma_send_otp', async (req, res) => {
  try {
    const { immatriculation } = req.body; 
    console.log('[verify_imma_send_otp] body reçu:', JSON.stringify(req.body), '| immatriculation (type):', typeof immatriculation, '| immatriculation (value):', immatriculation);

    if (!immatriculation) {
      return res.status(400).json({ message: 'Immatriculation requise' });
    }

    // Find user by identity (immatriculation)
    const User = await Users.findOne({ where: { identity: immatriculation } });
    if (!User) {
      return res.status(400).json({ message: 'Utilisateur non trouvé' });
    }

    if (!User.can_work) {
      return res.status(400).json({ message: 'Utilisateur non trouvé' });
    }

    // Generate OTP secret if user doesn't have one
    if (!User.otp_secret) {
      User.otp_secret = utility2.generateOtpSecret();
      await User.save();
    }

    // Generate OTP code using user's secret
    const otpCode = utility2.generateOtpCode(User.otp_secret);

    if (User.role === 'employeur') {
      const employeur = await Employeur.findOne({ where: { no_immatriculation: immatriculation } });
      if (!employeur) {
        return res.status(400).json({ message: 'Employeur non trouvé' });
      }

      // Send OTP by SMS and email
      if (User.phone_number) {
        await utility2.sendOptCode(otpCode, User.phone_number);
      }
      if (User.email) {
        await utility2.sendOptByMail(otpCode, User.email);
      }
    } else {
      // For employe
      const employe = await Employe.findOne({ where: { no_immatriculation: immatriculation } });
      if (!employe) {
        return res.status(400).json({ message: 'Employé non trouvé' });
      }

      if (!employe.phone_number) {
        return res.status(400).json({ message: 'Veuillez contacter votre employeur pour mettre à jour votre numéro de téléphone.' });
      }

      // Send OTP by SMS
      await utility2.sendOptCode(otpCode, employe.phone_number);
      if (employe.email) {
        await utility2.sendOptByMail(otpCode, employe.email);
      }
    }

    // Token court (10 min) pour appeler verify_otp_reset avec le même utilisateur
    const token = jwt.sign(
      { id: User.id, identity: User.identity, role: User.role, user_identify: User.user_identify, user_id: User.user_id },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    return res.status(200).json({
      user: sanitizeUser(User),
      email: User.email || null,
      phone_number: User.phone_number || null,
      token
    });
  } catch (error) {
    console.error('Verify imma send OTP error:', error);
    return res.status(500).json({ message: 'Erreur interne veuillez reessayer plus tard' });
  }
});

// POST /api/v1/user/verify_otp_reset — protégé par le token renvoyé par verify_imma_send_otp
router.post('/verify_otp_reset', utility.otpVerifyToken, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Code OTP requis' });
    }

    // Utilisateur identifié par le token (verify_imma_send_otp)
    const user = await Users.findOne({ where: { identity: req.user.identity } });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Generate OTP secret if user doesn't have one
    if (!user.otp_secret) {
      user.otp_secret = utility2.generateOtpSecret();
      await user.save();
    }

    // Verify OTP using user's secret
    const isValid = utility2.verifyOtp(code, user.otp_secret);
    if (!isValid) {
      return res.status(400).json({ message: 'Code OTP expiré ou incorrecte' });
    }

    return res.status(200).json({ message: 'ok' });
  } catch (error) {
    console.error('Verify OTP reset error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// ============================================
// 2. MOT DE PASSE & SÉCURITÉ
// ============================================

// POST /api/v1/user/resete_password_first_login — token first_login (JWT_SECRET, otpVerifyToken), comme avant.
router.post('/resete_password_first_login', utility.otpVerifyToken, async (req, res) => {
  try {
    const { user_password, new_password } = req.body;

    if (!user_password || !new_password) {
      return res.status(400).json({ message: 'Ancien et nouveau mot de passe requis' });
    }

    const user = await Users.findOne({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Verify old password
    const isPasswordValid = await utility.comparePassword(user_password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Ancien mot de passe incorrect' });
    }

    // Hash new password
    const hashedPassword = await utility.hashPassword(new_password);
    await user.update({
      password: hashedPassword,
      first_login: false
    });

    // Delete session to force re-login
    await utility.deleteSession(user.id);

    return res.status(200).json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST /api/v1/user/resete_password_employe (employé)
router.post('/resete_password_employe', utility.EmployeToken, async (req, res) => {
  try {
    const { user_password, new_password } = req.body;

    if (!user_password || !new_password) {
      return res.status(400).json({ message: 'Ancien et nouveau mot de passe requis' });
    }

    const user = await Users.findOne({ where: { identity: req.user.identity } });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Verify old password
    const isPasswordValid = await utility.comparePassword(user_password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Ancien mot de passe incorrect' });
    }

    // Hash new password
    const hashedPassword = await utility.hashPassword(new_password);
    await user.update({
      password: hashedPassword,
      first_login: false
    });

    return res.status(200).json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    console.error('Reset password employe error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST /api/v1/user/reset_password_forgot
router.post('/reset_password_forgot', async (req, res) => {
  try {
    const { imma, new_password } = req.body;

    if (!imma || !new_password) {
      return res.status(400).json({ message: 'Immatriculation et nouveau mot de passe requis' });
    }

    const user = await Users.findOne({ where: { identity: imma } });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Hash new password
    const hashedPassword = await utility.hashPassword(new_password);
    await user.update({
      password: hashedPassword,
      first_login: false
    });

    return res.status(200).json({ role: user.role, message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    console.error('Reset password forgot error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST /api/v1/user/modify_password
router.post('/modify_password', utility.EmployeurToken, async (req, res) => {
  try {
    const { password, new_password } = req.body;

    if (!password || !new_password) {
      return res.status(400).json({ message: 'Ancien et nouveau mot de passe requis' });
    }

    const user = await Users.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Verify old password
    const isPasswordValid = await utility.comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Ancien mot de passe incorrect' });
    }

    // Hash new password
    const hashedPassword = await utility.hashPassword(new_password);
    await user.update({ password: hashedPassword });

    return res.status(200).json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    console.error('Modify password error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST /api/v1/user/reset_employe_password_on_mobile/:id
router.post('/reset_employe_password_on_mobile/:id', async (req, res) => {
  try {
    const { new_password } = req.body;
    const { id } = req.params;

    if (!new_password) {
      return res.status(400).json({ message: 'Nouveau mot de passe requis' });
    }

    const user = await Users.findOne({ where: { identity: id } });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Hash new password
    const hashedPassword = await utility.hashPassword(new_password);
    await user.update({
      password: hashedPassword,
      first_login: false
    });

    return res.status(200).json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    console.error('Reset employe password mobile error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// ============================================
// 3. GESTION DU PROFIL EMPLOYEUR
// ============================================

// POST /api/v1/user/change_email_and_phone_number
router.post('/change_email_and_phone_number', utility.EmployeurToken, async (req, res) => {
  try {
    const { email, phone_number, full_name } = req.body;

    const user = await Users.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const updateData = {};
    if (email) updateData.email = email;
    if (phone_number) updateData.phone_number = phone_number;
    if (full_name) updateData.full_name = full_name;

    await user.update(updateData);

    return res.status(200).json({ message: 'Informations mises à jour avec succès', user: sanitizeUser(user) });
  } catch (error) {
    console.error('Change email and phone error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// ============================================
// 4. GESTION DES SOUS-COMPTES EMPLOYEURS
// ============================================

// POST /api/v1/user/create_user
router.post('/create_user', utility.EmployeurToken, async (req, res) => {
  try {
    const { full_name, email, phone_number, role } = req.body;

    if (!full_name || !email || !phone_number || !role) {
      return res.status(400).json({ message: 'Tous les champs sont requis' });
    }

    // Check if user already exists for this employer
    const existingUser = await Users.findOne({
      where: {
        user_identify: req.user.user_identify,
        [Op.or]: [
          { email },
          { phone_number }
        ]
      }
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ message: 'Email existant' });
      }
      if (existingUser.phone_number === phone_number) {
        return res.status(400).json({ message: 'Numéro de téléphone existant' });
      }
    }

    // Generate random password
    const randomPassword = utility.generateUniqueCode(9);
    const hashedPassword = await utility.hashPassword(randomPassword);

    // Generate identity
    const identity = await generateIdentity(role, req.user.user_identify);

    // Generate OTP secret for new user
    const otpSecret = utility2.generateOtpSecret();

    // Create user
    const newUser = await Users.create({
      user_identify: req.user.user_identify,
      identity,
      role: 'employeur',
      type: role,
      password: hashedPassword,
      full_name,
      email,
      phone_number,
      user_id: req.user.user_id,
      otp_secret: otpSecret,
      can_work: true,
      first_login: true
    });

    // Get employer info
    const employeur = await Employeur.findByPk(req.user.user_id);
    if (!employeur) {
      return res.status(404).json({ message: 'Employeur non trouvé' });
    }

    // Send welcome email
    await utility2.CreateUserMail(newUser, employeur, randomPassword);

    // If Payeur, add to Paylican
    if (role === 'Payeur') {
      const nameParts = full_name.split(' ');
      newUser.first_name = nameParts[0] || '';
      newUser.last_name = nameParts.slice(1).join(' ') || '';
      await newUser.save();

      await employeurUtility.addingUserPaylican(newUser, employeur);
    }

    return res.status(200).json({ message: 'Utilisateur créé avec succès' });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur', error: error.message });
  }
});

// GET /api/v1/user/his_list
router.get('/his_list', utility.EmployeurToken, async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    
    // Get total count for pagination
    const total = await Users.count({
      where: { user_identify: req.user.user_identify }
    });

    // Get paginated users
    const users = await Users.findAll({
      where: { user_identify: req.user.user_identify },
      attributes: { exclude: ['password', 'otp_secret'] },
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    // Sanitize users
    const sanitizedUsers = users.map(user => sanitizeUser(user));

    return res.status(200).json(formatPaginatedResponse(sanitizedUsers, total, page, limit));
  } catch (error) {
    console.error('Get user list error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST /api/v1/user/delete_user/:id
router.post('/delete_user/:id', utility.EmployeurToken, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await Users.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Check if user belongs to the same employer
    if (user.user_identify !== req.user.user_identify) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    // If Payeur, delete from Paylican
    if (user.type === 'Payeur') {
      await employeurUtility.DeleteDelegateUser(user.identity);
    }

    // Soft delete
    await user.update({ can_work: false });

    return res.status(200).json({ message: 'utilisateur supprimer' });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST /api/v1/user/update_user/:id
router.post('/update_user/:id', utility.EmployeurToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, phone_number, type, full_name } = req.body;

    const user = await Users.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Check if user belongs to the same employer
    if (user.user_identify !== req.user.user_identify) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    const updateData = {};
    if (email) updateData.email = email;
    if (phone_number) updateData.phone_number = phone_number;
    if (type) updateData.type = type;
    if (full_name) updateData.full_name = full_name;

    await user.update(updateData);

    return res.status(200).json({ message: 'Utilisateur mis à jour avec succès', user: sanitizeUser(user) });
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// POST /api/v1/user/active_user/:id
router.post('/active_user/:id', utility.EmployeurToken, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await Users.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Check if user belongs to the same employer
    if (user.user_identify !== req.user.user_identify) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    await user.update({ can_work: true });

    return res.status(200).json({ message: 'Utilisateur activé avec succès' });
  } catch (error) {
    console.error('Active user error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// ============================================
// 5. DÉCONNEXION & VÉRIFICATION DE SESSION
// ============================================

// POST /api/v1/user/signOut — accepte token employeur ou first_login (VerifyTokenFlexible)
router.post('/signOut', utility.VerifyTokenFlexible, async (req, res) => {
  try {
    const userId = req.user.id;
    const isFirstLogin = !!req.user.first_login;
    if (!isFirstLogin && utility.isRedisConnected()) await utility.deleteSession(userId);
    return res.status(200).json({ message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('Sign out error:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur' });
  }
});

// GET /api/v1/user/verify_token — accepte token employeur ou first_login (pour /first-login et dashboard)
router.get('/verify_token', utility.VerifyTokenFlexible, async (req, res) => {
  try {
    const user = await Users.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    const sanitized = sanitizeUser(user);
    const type = user.type || user.role || 'payeur';
    const role = user.role || user.type || 'payeur';
    return res.status(200).json({
      message: 'Token valide',
      user: { ...sanitized, type, role, userRole: type }
    });
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide' });
  }
});

module.exports = router;
