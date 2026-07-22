const { DataTypes } = require('sequelize');
const crypto = require('crypto');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');

/**
 * pending             : En cours de vérification (créée par l'employeur)
 * received            : Demande reçue (validée par le BO) — déclenche l'email avec le lien uuid
 * documents_submitted : Documents complémentaires soumis par l'employeur (via le lien)
 * approved            : Validée par le BO — déclenche un email de confirmation
 * rejected            : Rejetée par le BO (avec motif) — déclenche un email avec le motif
 */
const ACCIDENT_TRAVAIL_STATUSES = ['pending', 'received', 'documents_submitted', 'approved', 'rejected'];

const AccidentTravail = sequelize.define('AccidentTravail', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  uuid: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    defaultValue: () => crypto.randomUUID(),
    comment: 'Identifiant public utilisé dans le lien email (page de soumission des documents complémentaires)'
  },
  reference: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Ex: EADT-2026-001'
  },
  employeur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Employeur, key: 'id' }
  },
  employe_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Employe, key: 'id' }
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending',
    comment: ACCIDENT_TRAVAIL_STATUSES.join(', ')
  },
  date_response: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date de réponse / traitement terminé'
  },
  modele_path: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Chemin du PDF modèle généré (téléchargé par l\'employeur)'
  },
  document_path: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Chemin du modèle rempli, signé et cacheté, uploadé par l\'employeur'
  },
  documents_complementaires: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Documents complémentaires soumis via le lien email (max 4) : [{ path, name }]'
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Motif de rejet saisi par le BO, visible par l\'employeur'
  }
}, {
  tableName: 'accident_travail_demandes',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['employeur_id'] },
    { fields: ['employe_id'] },
    { fields: ['status'] },
    { fields: ['reference'] }
  ]
});

AccidentTravail.belongsTo(Employeur, { foreignKey: 'employeur_id', as: 'employeur' });
AccidentTravail.belongsTo(Employe, { foreignKey: 'employe_id', as: 'employe' });

AccidentTravail.ACCIDENT_TRAVAIL_STATUSES = ACCIDENT_TRAVAIL_STATUSES;

module.exports = AccidentTravail;
