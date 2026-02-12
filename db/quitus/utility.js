const Quitus = require('./model');

const utility = {
  findByReference: async (reference) => {
    return await Quitus.findOne({ where: { reference } });
  },

  findByDemande: async (demandeId) => {
    return await Quitus.findOne({ where: { demandeId } });
  },

  findByEmployeur: async (employeurId) => {
    return await Quitus.findAll({ where: { employeurId } });
  }
};

module.exports = utility;
