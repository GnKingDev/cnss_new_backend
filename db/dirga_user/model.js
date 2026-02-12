const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');

const DirgaU = sequelize.define('dirgaU', {
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
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false
  },
  password: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  can_work: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  type: {
    type: DataTypes.STRING,
    defaultValue: 'admin'
  }
}, {
  tableName: 'dirgas',
  timestamps: true
});

module.exports = DirgaU;
