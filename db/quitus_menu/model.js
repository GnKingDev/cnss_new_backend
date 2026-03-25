const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');
const CotisationEmployeur = require('../cotisation_employeur/model');

const QuitusDemande = sequelize.define('QuitusDemande', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  reference: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Ex: QUI-2024-004'
  },
  employeur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Employeur, key: 'id' }
  },
  cotisation_employeur_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: CotisationEmployeur, key: 'id' },
    comment: 'Période concernée (mois/annee)'
  },
  mois: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: '01-12 ou 13,14,15'
  },
  annee: {
    type: DataTypes.STRING,
    allowNull: true
  },
  periode: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Ex: Décembre 2024'
  },
  statut: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'en_cours',
    comment: 'en_cours | valide'
  },
  montant: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: 'Total cotisations période (GNF)'
  },
  document_path: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Attestation quitus PDF (si statut=valide)'
  },
  document_rccm: {
    type: DataTypes.STRING,
    allowNull: true
  },
  document_nif: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'quitus_demandes',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['employeur_id'] },
    { fields: ['statut'] },
    { fields: ['reference'] }
  ]
});

QuitusDemande.belongsTo(Employeur, { foreignKey: 'employeur_id', as: 'employeur' });
QuitusDemande.belongsTo(CotisationEmployeur, { foreignKey: 'cotisation_employeur_id', as: 'cotisation_employeur' });

module.exports = QuitusDemande;
