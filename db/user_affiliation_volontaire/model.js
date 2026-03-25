const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const AffiliationVolontaire = require('../affiliation-volontaire/model');

/**
 * Utilisateur de connexion pour l'affiliation volontaire (portail AV).
 * Distinct du modèle users (portail employeur).
 * Les détails (nom, prénom, email, téléphone, etc.) sont dans affiliation_volontaire.
 */
const UserAffiliationVolontaire = sequelize.define('user_affiliation_volontaire', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  affiliationVolontaireId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { 
      model: AffiliationVolontaire,   
      key: 'id' 
    }
  },
  user_identify: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Identifiant de connexion (ex: no_immatriculation AV ou email)'
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Numéro de téléphone (copie ou lien pour OTP / contact)'
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true
  },
  first_login: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  otp_secret: {
    type: DataTypes.STRING,
    allowNull: true
  },
  last_connect_time: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'user_affiliation_volontaire',
  timestamps: true
});

UserAffiliationVolontaire.belongsTo(AffiliationVolontaire, { foreignKey: 'affiliationVolontaireId', as: 'affiliationVolontaire' });

module.exports = UserAffiliationVolontaire;
