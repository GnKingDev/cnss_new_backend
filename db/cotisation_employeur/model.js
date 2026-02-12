const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');
const Users = require('../users/model');

const CotisationEmployeur = sequelize.define('cotisation_employeur', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  periode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  trimestre: {
    type: DataTypes.STRING,
    allowNull: true
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  total_salary: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  total_salary_soumis_cotisation: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  total_cotisation_employe: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  total_cotisation_employeur: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  total_cotisation: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  effectif_embauche: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  effectif_leave: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  current_effectif: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  facture_path: {
    type: DataTypes.STRING,
    allowNull: true
  },
  motif: {
    type: DataTypes.STRING,
    defaultValue: 'FACTURATION SUR PRINCIPAL'
  },
  prestation_familiale: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  risque_professionnel: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  assurance_maladie: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  vieillesse: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  total_branche: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  real_total_branche: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  quittance: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_paid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  paid_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  debut_echeance_principal: {
    type: DataTypes.DATE,
    allowNull: true
  },
  fin_echeance_principal: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_penalite_applied: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  penelite_amount: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  paid_by_us: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_degrade_mode: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  which_methode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_insert_oldDB_debit: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_insert_oldDB_credit: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  employeurId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Employeur,
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Users,
      key: 'id'
    }
  }
}, {
  tableName: 'cotisation_employeurs',
  timestamps: true
});

// Relations
CotisationEmployeur.belongsTo(Employeur, { foreignKey: 'employeurId', as: 'employeur' });
CotisationEmployeur.belongsTo(Users, { foreignKey: 'userId', as: 'user' });

module.exports = CotisationEmployeur;
