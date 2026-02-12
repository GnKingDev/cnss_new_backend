const Activity = require('./model');

const utility = {
  findByCode: async (code) => {
    return await Activity.findOne({ where: { code } });
  },

  findByName: async (name) => {
    return await Activity.findOne({ where: { name } });
  }
};

module.exports = utility;
