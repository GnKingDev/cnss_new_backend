const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employe = require('../employe/model');
const Conjoint = require('../conjoint/model');

const Enfant = sequelize.define('Enfant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  date_of_birth: {
    type: DataTypes.DATE,
    allowNull: false
  },
  place_of_birth: {
    type: DataTypes.STRING,
    allowNull: true
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ordre: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  picture: {
    type: DataTypes.STRING,
    allowNull: true
  },
  extrait_file: {
    type: DataTypes.STRING,
    allowNull: true
  },
  date_ajout: {
    type: DataTypes.DATE,
    allowNull: true
  },
  code_conjoint: {
    type: DataTypes.STRING,
    allowNull: true
  },
  no_enfant: {
    type: DataTypes.STRING,
    allowNull: true
  },
  statut: {
    type: DataTypes.STRING,
    allowNull: true
  },
  statut_dossier: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'en_cours_validation'
  },
  employeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Employe,
      key: 'id'
    }
  },
  conjointId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Conjoint,
      key: 'id'
    }
  }
}, {
  tableName: 'enfants',
  timestamps: true
});

// Relations
Enfant.belongsTo(Employe, { foreignKey: 'employeId', as: 'employe' });
Enfant.belongsTo(Conjoint, { foreignKey: 'conjointId', as: 'conjoint' });

module.exports = Enfant;
