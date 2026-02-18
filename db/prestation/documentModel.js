const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const PrestationDemande = require('./model');

const PrestationDocument = sequelize.define('PrestationDocument', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  prestation_demande_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: PrestationDemande, key: 'id' }
  },
  document_type_id: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Ex: lettre_transmission, carnet_assure, ...'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  path: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Relative path ex: uploads/prestations/xxx.pdf'
  },
  size: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  mime_type: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'application/pdf'
  },
  required: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: true
  },
  status: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'uploaded'
  }
}, {
  tableName: 'prestation_documents',
  timestamps: true,
  updatedAt: false,
  underscored: true
});

PrestationDocument.belongsTo(PrestationDemande, { foreignKey: 'prestation_demande_id', as: 'demande' });

module.exports = PrestationDocument;
