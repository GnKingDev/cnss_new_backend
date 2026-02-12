const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Users = require('../users/model');

const Otp = sequelize.define('otp', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  can_use: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Users,
      key: 'id'
    }
  }
}, {
  tableName: 'otps',
  timestamps: true
});

// Relations
Otp.belongsTo(Users, { foreignKey: 'userId', as: 'user' });

module.exports = Otp;
