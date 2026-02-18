const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');

const BiometrieAgence = sequelize.define('BiometrieAgence', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom: {
    type: DataTypes.STRING,
    allowNull: false
  },
  adresse: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  disponible: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: true
  }
}, {
  tableName: 'biometrie_agences',
  timestamps: true,
  underscored: true
});

module.exports = BiometrieAgence;
