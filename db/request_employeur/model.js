const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');

const RequestEmployeur = sequelize.define('request_employeur', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  first_name: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  last_name: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  date_of_birth: {
    type: DataTypes.DATE,
    allowNull: true
  },
  place_of_birth: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  gender: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  prefecture: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  TYPE_ATTACHEMENTS: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  file: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  avatar: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'request_employeurs',
  timestamps: true
});

module.exports = RequestEmployeur;
