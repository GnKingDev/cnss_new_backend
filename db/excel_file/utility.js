const ExcelFile = require('./model');

const utility = {
  findByDemande: async (demandeId) => {
    return await ExcelFile.findAll({ where: { demandeId } });
  },

  findByEmployeur: async (employeurId) => {
    return await ExcelFile.findAll({ where: { employeurId } });
  }
};

module.exports = utility;
