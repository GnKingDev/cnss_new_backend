const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');

const Document = sequelize.define('document', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  code: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  employeurId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Employeur,
      key: 'id'
    }
  }
}, {
  tableName: 'documents',
  timestamps: true
});

// Relations
Document.belongsTo(Employeur, { foreignKey: 'employeurId', as: 'employeur' });

module.exports = Document;
