const Document = require('./model');

const utility = {
  findByEmployeur: async (employeurId) => {
    return await Document.findAll({ where: { employeurId } });
  },

  findByCode: async (code) => {
    return await Document.findOne({ where: { code } });
  }
};

module.exports = utility;
