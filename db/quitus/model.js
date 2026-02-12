const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');
const Demande = require('../demandes/model');

const Quitus = sequelize.define('Quitus', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  reference: {
    type: DataTypes.STRING,
    allowNull: true
  },
  secret_code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  path: {
    type: DataTypes.STRING,
    allowNull: true
  },
  quitus_expire_date: {
    type: DataTypes.STRING,
    allowNull: true
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
  tableName: 'quitus',
  timestamps: true
});

// Relations
Quitus.belongsTo(Employeur, { foreignKey: 'employeurId', as: 'employeur' });
Quitus.belongsTo(Demande, { foreignKey: 'demandeId', as: 'demande' });

module.exports = Quitus;
