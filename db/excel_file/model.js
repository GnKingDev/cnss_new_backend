const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');
const Demande = require('../demandes/model');

const ExcelFile = sequelize.define('excelFile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  path: {
    type: DataTypes.STRING,
    allowNull: true
  },
  traite: {
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
  demandeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Demande,
      key: 'id'
    }
  }
}, {
  tableName: 'excelFiles',
  timestamps: true
});

// Relations
ExcelFile.belongsTo(Employeur, { foreignKey: 'employeurId', as: 'employeur' });
ExcelFile.belongsTo(Demande, { foreignKey: 'demandeId', as: 'demande' });

module.exports = ExcelFile;
