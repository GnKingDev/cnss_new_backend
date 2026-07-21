const nodemailer = require('nodemailer');

const port = parseInt(process.env.SMTP_PORT || '587', 10);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port,
  secure: port === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const user_email_name = process.env.SMTP_USER || 'noreply@cnss.gov.gn';

module.exports = { transporter, user_email_name };
