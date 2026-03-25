const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');

const DirgaU = sequelize.define('dirgaU', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  matricule: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true,
    comment: 'Matricule agent (ex: ADM-001), utilisé pour le login BO'
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false
  },
  password: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  telephone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  service: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Service / direction (ex: DIRGA - Immatriculation)'
  },
  can_work: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  type: {
    type: DataTypes.STRING,
    defaultValue: 'admin',
    comment: 'Rôle: admin, directeur, chef_service, agent'
  },
  permissions: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Liste des permissions (ex: ["view_all","approve",...]). Si vide, dérivée du rôle.'
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'dirgas',
  timestamps: true
});

module.exports = DirgaU;
