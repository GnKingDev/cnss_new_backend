const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');

const Pays = sequelize.define('pays', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  code: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'pays',
  timestamps: true
});

module.exports = Pays;
