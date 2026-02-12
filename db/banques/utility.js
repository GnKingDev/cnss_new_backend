const Banque = require('./model');

const utility = {
  findByCollectorCode: async (collector_code) => {
    return await Banque.findOne({ where: { collector_code } });
  },

  findByName: async (name) => {
    return await Banque.findOne({ where: { name } });
  }
};

module.exports = utility;
