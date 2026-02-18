const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employe = require('../employe/model');
const Employeur = require('../XYemployeurs/model');

const Carer = sequelize.define('carer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  date_entre: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_sortie: {
    type: DataTypes.DATE,
    allowNull: true
  },
  employeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Employe,
      key: 'id'
    }
  },
  employeurId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Employeur,
      key: 'id'
    }
  },
  titre: {
    type: DataTypes.STRING,
    allowNull: true
  },
  salaire: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  departement: {
    type: DataTypes.STRING,
    allowNull: true
  },
  type_contrat: {
    type: DataTypes.STRING,
    allowNull: true
  },
  responsabilites: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'carriers',
  timestamps: true
});

// Relations
Carer.belongsTo(Employe, { foreignKey: 'employeId', as: 'employe' });
Carer.belongsTo(Employeur, { foreignKey: 'employeurId', as: 'employeur' });

module.exports = Carer;
