const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');

const Banque = sequelize.define('Banque', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  collector_code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  old_db_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'banques',
  timestamps: true
});

module.exports = Banque;
