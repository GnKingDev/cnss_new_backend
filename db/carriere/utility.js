const Carer = require('./model');

const utility = {
  findByEmploye: async (employeId) => {
    return await Carer.findAll({ where: { employeId } });
  },

  findByEmployeur: async (employeurId) => {
    return await Carer.findAll({ where: { employeurId } });
  }
};

module.exports = utility;
