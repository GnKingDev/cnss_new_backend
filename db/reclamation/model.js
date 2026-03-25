const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');

const RECLAMATION_TYPES = [
  'quittance', 'notification', 'facture', 'certificat', 'annulation',
  'rectification', 'correction_naissance', 'correction_genre', 'autre'
];
const RECLAMATION_STATUSES = ['pending', 'approved', 'rejected', 'processing'];

const CotisationEmployeur = require('../cotisation_employeur/model');

const ReclamationDemande = sequelize.define('ReclamationDemande', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  reference: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Ex: REC-2024-001'
  },
  employeur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Employeur, key: 'id' }
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: RECLAMATION_TYPES.join(', ')
  },
  libelle: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending',
    comment: RECLAMATION_STATUSES.join(', ')
  },
  progress: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '0-100'
  },
  date_response: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date de réponse / traitement terminé'
  },
  document_path: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Chemin document principal (upload)'
  },
  documents_complementaires: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Tableau de chemins ou [{ path, name }]'
  },
  mois: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Pour quittance/facture: 01-12 ou 13,14,15'
  },
  annee: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Pour quittance/facture'
  },
  periode_verifiee: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
    comment: 'True si vérification paiement faite avant création'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Pour type "autre"'
  },
  cotisation_employeur_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: CotisationEmployeur, key: 'id' },
    comment: 'ID de la déclaration concernée (pour annulation)'
  }
}, {
  tableName: 'reclamation_demandes',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['employeur_id'] },
    { fields: ['status'] },
    { fields: ['type'] },
    { fields: ['reference'] }
  ]
});

ReclamationDemande.belongsTo(Employeur, { foreignKey: 'employeur_id', as: 'employeur' });
ReclamationDemande.belongsTo(CotisationEmployeur, { foreignKey: 'cotisation_employeur_id', as: 'cotisation' });

ReclamationDemande.RECLAMATION_TYPES = RECLAMATION_TYPES;
ReclamationDemande.RECLAMATION_STATUSES = RECLAMATION_STATUSES;

module.exports = ReclamationDemande;
