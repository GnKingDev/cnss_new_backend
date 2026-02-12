const Conjoint = require('./model');

const utility = {
  findByEmploye: async (employeId) => {
    return await Conjoint.findAll({ where: { employeId } });
  },

  findByCode: async (code_conjoint) => {
    return await Conjoint.findOne({ where: { code_conjoint } });
  }
};

module.exports = utility;
