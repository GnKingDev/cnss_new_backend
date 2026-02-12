const Enfant = require('./model');

const utility = {
  findByEmploye: async (employeId) => {
    return await Enfant.findAll({ where: { employeId } });
  },

  findByConjoint: async (conjointId) => {
    return await Enfant.findAll({ where: { conjointId } });
  }
};

module.exports = utility;
