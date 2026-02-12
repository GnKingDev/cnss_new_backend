const Branche = require('./model');

const utility = {
  findByCode: async (code) => {
    return await Branche.findOne({ where: { code } });
  },

  findByName: async (name) => {
    return await Branche.findOne({ where: { name } });
  },

  findByActivity: async (activityId) => {
    return await Branche.findAll({ where: { activityId } });
  }
};

module.exports = utility;
