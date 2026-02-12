const Otp = require('./model');

const utility = {
  findByCode: async (code) => {
    return await Otp.findOne({ where: { code, can_use: true } });
  },

  findByUser: async (userId) => {
    return await Otp.findAll({ where: { userId, can_use: true } });
  }
};

module.exports = utility;
