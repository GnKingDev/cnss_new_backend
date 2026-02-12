const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');

const Activity = sequelize.define('activity', {
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
  tableName: 'activities',
  timestamps: true
});

module.exports = Activity;
