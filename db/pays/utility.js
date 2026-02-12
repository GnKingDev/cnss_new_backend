const Pays = require('./model');

const utility = {
  // Find pays by code
  findByCode: async (code) => {
    return await Pays.findOne({ where: { code } });
  },

  // Find pays by name
  findByName: async (name) => {
    return await Pays.findOne({ where: { name } });
  }
};

module.exports = utility;
