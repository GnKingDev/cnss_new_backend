const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employe = require('../employe/model');
const Employeur = require('../XYemployeurs/model');
const CotisationEmployeur = require('../cotisation_employeur/model');

const Demploye = sequelize.define('Demploye', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  salary_brut: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  salary_soumis_cotisation: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  cotisation_employe: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  cotisation_emplyeur: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  total_cotisation: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  periode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  trimestre: {
    type: DataTypes.STRING,
    allowNull: true
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  employeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Employe,
      key: 'id'
    }
  },
  employeurId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Employeur,
      key: 'id'
    }
  },
  cotisation_employeurId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: CotisationEmployeur,
      key: 'id'
    }
  }
}, {
  tableName: 'declaratio_employes',
  timestamps: true
});

// Relations
Demploye.belongsTo(Employe, { foreignKey: 'employeId', as: 'employe' });
Demploye.belongsTo(Employeur, { foreignKey: 'employeurId', as: 'employeur' });
Demploye.belongsTo(CotisationEmployeur, { foreignKey: 'cotisation_employeurId', as: 'cotisation_employeur' });

module.exports = Demploye;
