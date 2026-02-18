const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');
const Prefecture = require('../prefecture/model');

const Employe = sequelize.define('employe', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  avatar: {
    type: DataTypes.STRING,
    defaultValue: 'uploads/user.jpeg'
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: false
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
  matricule: {
    type: DataTypes.STRING,
    allowNull: true
  },
  adress: {
    type: DataTypes.STRING,
    allowNull: true
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: true
  },
  situation_matrimoniale: {
    type: DataTypes.STRING,
    allowNull: true
  },
  date_of_birth: {
    type: DataTypes.DATE,
    allowNull: true
  },
  place_of_birth: {
    type: DataTypes.STRING,
    allowNull: true
  },
  nationality: {
    type: DataTypes.STRING,
    allowNull: true
  },
  father_first_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  father_last_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  mother_first_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  mother_last_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  no_immatriculation: {
    type: DataTypes.STRING,
    allowNull: true,
    
  },
  immatriculation_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  worked_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  salary: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  cni_file: {
    type: DataTypes.STRING,
    allowNull: true
  },
  type_contrat: {
    type: DataTypes.STRING,
    allowNull: true
  },
  contrat_file: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_imma: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  can_pay: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_out: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  ville: {
    type: DataTypes.STRING,
    allowNull: true
  },
  fonction: {
    type: DataTypes.STRING,
    allowNull: true
  },
  who_valid: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  out_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  exit_reason: {
    type: DataTypes.STRING,
    allowNull: true
  },
  notice_period: {
    type: DataTypes.STRING,
    allowNull: true
  },
  exit_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  father_date_of_birth: {
    type: DataTypes.DATE,
    allowNull: true
  },
  mother_date_of_birth: {
    type: DataTypes.DATE,
    allowNull: true
  },
  father_statut: {
    type: DataTypes.STRING,
    allowNull: true
  },
  mother_statut: {
    type: DataTypes.STRING,
    allowNull: true
  },
  request_can_pay: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_insert_oldDB: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  identity_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_adhesion: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  date_first_embauche: {
    type: DataTypes.DATE,
    allowNull: true
  },
  has_biometric: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  card_expiry: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  biometric_status: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'nouveau',
    comment: 'actif | en_attente | expiré | nouveau'
  },
  employeurId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Employeur,
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
  tableName: 'employes',
  timestamps: true
});

// Relations
Employe.belongsTo(Employeur, { foreignKey: 'employeurId', as: 'employeur' });
Employe.belongsTo(Prefecture, { foreignKey: 'prefectureId', as: 'prefecture' });

module.exports = Employe;
