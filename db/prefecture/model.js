const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Pays = require('../pays/model');

const Prefecture = sequelize.define('prefecture', {
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
    type: DataTypes.STRING,
    allowNull: true,
    unique: true // Ensure code uniqueness
  },
  paysId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Pays,
      key: 'id'
    }
  }
}, {
  tableName: 'prefectures',
  timestamps: true
});

// Relations
Prefecture.belongsTo(Pays, { foreignKey: 'paysId', as: 'pays' });

module.exports = Prefecture;
