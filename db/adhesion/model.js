const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');

const Adhesion = sequelize.define('adhesion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  raison_sociale: {
    type: DataTypes.STRING,
    allowNull: true
  },
  no_immatriculation: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  effectif_femme: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  effectif_homme: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  effectif_apprentis: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  fax: {
    type: DataTypes.STRING,
    allowNull: true
  },
  no_dni: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  no_rccm: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  date_creation: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_first_embauche: {
    type: DataTypes.DATE,
    allowNull: true
  },
  main_activity: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true
  },
  active_btn: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  who_valid: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  is_valid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  valid_date: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'adhesions',
  timestamps: true
});

module.exports = Adhesion;
