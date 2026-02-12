const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Branche = require('../branches/model');
const Prefecture = require('../prefecture/model');

const AffiliationVolontaire = sequelize.define('affiliation_volontaire', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom: {
    type: DataTypes.STRING,
    allowNull: true
  },
  prenom: {
    type: DataTypes.STRING,
    allowNull: true
  },
  date_naissance: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lieu_naissance: {
    type: DataTypes.STRING,
    allowNull: true
  },
  sexe: {
    type: DataTypes.STRING,
    allowNull: true
  },
  adresse: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  profession: {
    type: DataTypes.STRING,
    allowNull: true
  },
  cni_file_path: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'Nouveau'
  },
  is_validated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  validated_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  validated_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  is_risque_professionnel_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  risque_professionnel_percentage: {
    type: DataTypes.FLOAT,
    defaultValue: 0.04
  },
  is_assurance_maladie_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  assurance_maladie_percentage: {
    type: DataTypes.FLOAT,
    defaultValue: 0.065
  },
  is_vieillesse_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  vieillesse_percentage: {
    type: DataTypes.FLOAT,
    defaultValue: 0.065
  },
  requester_picture: {
    type: DataTypes.STRING,
    allowNull: true
  },
  revenu_annuel: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  revenu_mensuel: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  plafond: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  cotisation: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  montant_trimestriel: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  no_immatriculation: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  certificat_residence_file: {
    type: DataTypes.STRING,
    allowNull: true
  },
  brancheId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Branche,
      key: 'id'
    }
  },
  prefectureId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Prefecture,
      key: 'id'
    }
  }
}, {
  tableName: 'affiliation_volontaire',
  timestamps: true
});

// Relations
AffiliationVolontaire.belongsTo(Branche, { foreignKey: 'brancheId', as: 'branche' });
AffiliationVolontaire.belongsTo(Prefecture, { foreignKey: 'prefectureId', as: 'prefecture' });

module.exports = AffiliationVolontaire;
