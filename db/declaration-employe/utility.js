const Demploye = require('./model');

const utility = {
  findByCotisation: async (cotisation_employeurId) => {
    return await Demploye.findAll({ where: { cotisation_employeurId } });
  },

  findByEmploye: async (employeId) => {
    return await Demploye.findAll({ where: { employeId } });
  }
};

module.exports = utility;
