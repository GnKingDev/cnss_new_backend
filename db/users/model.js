const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');

const Users = sequelize.define('users', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_identify: {
    type: DataTypes.STRING,
    allowNull: true
  },
  identity: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'admin'
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'admin'
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true
  },
  full_name: {
    type: DataTypes.STRING,
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
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  first_login: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  can_work: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  last_connect_time: {
    type: DataTypes.DATE,
    allowNull: true
  },
  otp_secret: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'users',
  timestamps: true
});

module.exports = Users;
