const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employe = require('../employe/model');

const Conjoint = sequelize.define('Conjoint', {
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
  date_mariage: {
    type: DataTypes.DATE,
    allowNull: false
  },
  code_conjoint: {
    type: DataTypes.STRING,
    allowNull: false
  },
  lieu_mariage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  father_first_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  father_last_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  mother_first_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  mother_last_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: false
  },
  profession: {
    type: DataTypes.STRING,
    allowNull: false
  },
  date_ajout: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  picture: {
    type: DataTypes.STRING,
    allowNull: true
  },
  civil_file: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ordre: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  employeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Employe,
      key: 'id'
    }
  }
}, {
  tableName: 'conjoints',
  timestamps: true
});

// Relations
Conjoint.belongsTo(Employe, { foreignKey: 'employeId', as: 'employe' });

module.exports = Conjoint;
