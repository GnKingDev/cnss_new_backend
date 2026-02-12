const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const CotisationEmployeur = require('../cotisation_employeur/model');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');
const Users = require('../users/model');

const Paiement = sequelize.define('paiement', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'Nouveau'
  },
  is_paid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  paid_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  paiement_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  invoiceId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  merchantReference: {
    type: DataTypes.STRING,
    allowNull: true
  },
  who_paid: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  bank_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  paid_by_us: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_degrade_mode: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  which_methode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  cotisation_employeurId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: CotisationEmployeur,
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
  employeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Employe,
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Users,
      key: 'id'
    }
  }
}, {
  tableName: 'paiements',
  timestamps: true
});

// Relations
Paiement.belongsTo(CotisationEmployeur, { foreignKey: 'cotisation_employeurId', as: 'cotisation_employeur' });
Paiement.belongsTo(Employeur, { foreignKey: 'employeurId', as: 'employeur' });
Paiement.belongsTo(Employe, { foreignKey: 'employeId', as: 'employe' });
Paiement.belongsTo(Users, { foreignKey: 'userId', as: 'user' });

module.exports = Paiement;
