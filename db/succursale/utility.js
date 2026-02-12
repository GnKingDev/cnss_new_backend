const Succursale = require('./model');

const utility = {
  findByNoImmatriculation: async (no_immatriculation) => {
    return await Succursale.findOne({ where: { no_immatriculation } });
  },

  findByEmployeur: async (employeurId) => {
    return await Succursale.findAll({ where: { employeurId } });
  }
};

module.exports = utility;
