const nodemailer = require('nodemailer');
const { authenticator } = require('otplib');

// Fenêtre TOTP : 2 steps avant/après = code valide ~90 s (évite 400 si saisie un peu lente)
authenticator.options = { step: 30, window: 2 };

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Email transporter configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const utility2 = {
  // Generate OTP secret for a user
  generateOtpSecret: () => {
    return authenticator.generateSecret();
  },

  // Generate OTP code using TOTP with user's secret
  generateOtpCode: (otpSecret) => {
    if (!otpSecret) {
      console.error('OTP secret is required');
      // Fallback: generate random 6-digit code
      return Math.floor(100000 + Math.random() * 900000).toString();
    }
    try {
      return authenticator.generate(otpSecret);
    } catch (error) {
      console.error('Error generating OTP:', error);
      // Fallback: generate random 6-digit code
      return Math.floor(100000 + Math.random() * 900000).toString();
    }
  },

  // Verify OTP code with user's secret
  verifyOtp: (code, otpSecret) => {
    if (!otpSecret) {
      console.error('OTP secret is required for verification');
      return false;
    }
    try {
      return authenticator.check(code, otpSecret);
    } catch (error) {
      console.error('Error verifying OTP:', error);
      return false;
    }
  },

  // Send OTP by email
  sendOptByMail: async (otp, email) => {
    if (!email) {
      console.warn('No email provided for OTP');
      return false;
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_USER || 'noreply@cnss.com',
        to: email,
        subject: 'Code OTP CNSS',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #2c3e50;">Code OTP CNSS</h2>
            <p>Votre code OTP est : <strong style="font-size: 24px; color: #e74c3c;">${otp}</strong></p>
            <p>Ce code est valide pendant 5 minutes.</p>
            <p style="color: #7f8c8d; font-size: 12px;">Ne partagez jamais ce code avec personne.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Error sending OTP email:', error);
      return false;
    }
  },

  // Send OTP by SMS (using SMS API)
  sendOptCode: async (code, phone_number) => {
    if (!phone_number) {
      console.warn('No phone number provided for OTP');
      return false;
    }

    try {
      // Option 1: Using SMS API (smspromtngn.com)
      if (process.env.SMS_API_URL && process.env.SMS_API_KEY) {
        await axios.post(process.env.SMS_API_URL, {
          to: phone_number,
          message: `Votre code OTP CNSS est: ${code}. Valide 5 minutes.`
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.SMS_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        return true;
      }

      // Option 2: Using Orange SMS API
      if (process.env.ORANGE_SMS_API_URL && process.env.ORANGE_SMS_API_KEY) {
        await axios.post(process.env.ORANGE_SMS_API_URL, {
          outboundSMSMessageRequest: {
            address: `tel:${phone_number}`,
            senderAddress: process.env.SMS_SENDER || 'CNSS',
            outboundSMSTextMessage: {
              message: `Votre code OTP CNSS est: ${code}. Valide 5 minutes.`
            }
          }
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.ORANGE_SMS_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        return true;
      }

      // Fallback: log to console (for development)
      console.log(`OTP Code for ${phone_number}: ${code}`);
      return true;
    } catch (error) {
      console.error('Error sending OTP SMS:', error);
      return false;
    }
  },

  // Create user welcome email
  CreateUserMail: async (user, Employeur, password) => {
    if (!user.email) {
      console.warn('No email provided for user creation');
      return false;
    }

    try {
      const userTypeLabel = user.type === 'Payeur' ? 'Payeur' : 'Responsable';
      
      const mailOptions = {
        from: process.env.SMTP_USER || 'noreply@cnss.com',
        to: user.email,
        subject: 'Bienvenue sur la plateforme CNSS',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #2c3e50;">Bienvenue sur la plateforme CNSS</h2>
            <p>Bonjour ${user.full_name},</p>
            <p>Votre compte ${userTypeLabel} a été créé avec succès pour l'employeur <strong>${Employeur.raison_sociale}</strong>.</p>
            <div style="background-color: #ecf0f1; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Identifiant:</strong> ${user.identity}</p>
              <p><strong>Mot de passe temporaire:</strong> ${password}</p>
            </div>
            <p style="color: #e74c3c;"><strong>Important:</strong> Veuillez changer votre mot de passe lors de votre première connexion.</p>
            <p>Bien cordialement,<br>L'équipe CNSS</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error('Error sending user creation email:', error);
      return false;
    }
  }
};

module.exports = utility2;
