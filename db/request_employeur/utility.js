const RequestEmployeur = require('./model');

const utility = {
  findByEmail: async (email) => {
    return await RequestEmployeur.findOne({ where: { email } });
  },

  findByPhone: async (phone_number) => {
    return await RequestEmployeur.findOne({ where: { phone_number } });
  }
};

module.exports = utility;
