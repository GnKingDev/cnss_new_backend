const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');

const BiometrieDemande = sequelize.define('BiometrieDemande', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  reference: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    comment: 'Ex: BIO-2024-001'
  },
  employeur_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Employeur, key: 'id' }
  },
  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Employe, key: 'id' }
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'enrolement | mise_a_jour | renouvellement | remplacement | correction | rendez_vous'
  },
  statut: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'en_attente',
    comment: 'en_attente | planifié | en_traitement | terminé | rejeté'
  },
  progression: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  date_rdv: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  lieu_rdv: {
    type: DataTypes.STRING,
    allowNull: true
  },
  mode_rdv: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'agence | mobile'
  },
  agence_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  date_souhaitee: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  creneau: {
    type: DataTypes.STRING,
    allowNull: true
  },
  motif_remplacement: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'perte | vol | deterioree | defectueuse'
  },
  champ_a_corriger: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'nom | prenom | date_naissance | lieu_naissance | genre'
  },
  justification: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  consentement_obtenu: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  information_effectuee: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  historique: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of { etape, date }'
  }
}, {
  tableName: 'biometrie_demandes',
  timestamps: true,
  underscored: true
});

BiometrieDemande.belongsTo(Employeur, { foreignKey: 'employeur_id', as: 'employeur' });
BiometrieDemande.belongsTo(Employe, { foreignKey: 'employee_id', as: 'employee' });

module.exports = BiometrieDemande;
