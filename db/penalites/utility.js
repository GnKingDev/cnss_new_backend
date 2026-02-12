const Penalite = require('./model');

const utility = {
  findByEmployeur: async (employeurId) => {
    return await Penalite.findAll({ where: { employeurId } });
  },

  findByStatus: async (status) => {
    return await Penalite.findAll({ where: { status } });
  }
};

module.exports = utility;
