const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');

const PrestationDemande = sequelize.define('PrestationDemande', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  dossier_id: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    comment: 'Ex: PEN-2025-00001, null pour brouillon'
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
  request_type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'retraite_normale'
  },
  departure_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  motif: {
    type: DataTypes.STRING,
    allowNull: true
  },
  observations: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'brouillon'
  },
  submitted_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancelled_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  motif_annulation: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  employment: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'date_embauche, date_debauche, dernier_salaire'
  },
  bank_info: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'type_compte, operateur, numero_compte, nom_banque, rib'
  },
  children: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of { nom, prenom, date_naissance }'
  }
}, {
  tableName: 'prestation_demandes',
  timestamps: true,
  underscored: true
});

PrestationDemande.belongsTo(Employeur, { foreignKey: 'employeur_id', as: 'employeur' });
PrestationDemande.belongsTo(Employe, { foreignKey: 'employee_id', as: 'employee' });

module.exports = PrestationDemande;
