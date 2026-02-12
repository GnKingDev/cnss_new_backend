const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Activity = require('../domain_activite/model');

const Branche = sequelize.define('branches', {
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
  },
  activityId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Activity,
      key: 'id'
    }
  }
}, {
  tableName: 'branches',
  timestamps: true
});

// Relations
Branche.belongsTo(Activity, { foreignKey: 'activityId', as: 'activity' });

module.exports = Branche;
