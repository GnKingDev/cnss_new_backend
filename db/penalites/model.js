const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');

const Penalite = sequelize.define('Penalite', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  periode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  montant: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  no_quittance: {
    type: DataTypes.STRING,
    allowNull: true
  },
  facturation_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  motif: {
    type: DataTypes.STRING,
    allowNull: true
  },
  encaissement_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  is_paid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  merchantReference: {
    type: DataTypes.STRING,
    allowNull: true
  },
  invoiceId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'Nouveau'
  },
  data_penalite: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_insert_old_db: {
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
  }
}, {
  tableName: 'penalites',
  timestamps: true
});

// Relations
Penalite.belongsTo(Employeur, { foreignKey: 'employeurId', as: 'employeur' });

module.exports = Penalite;
