const DirgaU = require('./model');

const utility = {
  findByEmail: async (email) => {
    return await DirgaU.findOne({ where: { email } });
  }
};

module.exports = utility;
