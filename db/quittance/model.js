const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');
const CotisationEmployeur = require('../cotisation_employeur/model');
const Paiement = require('../paiement/model');

const Quittance = sequelize.define('Quittance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  reference: {
    type: DataTypes.STRING,
    allowNull: true
  },
  secret_code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  doc_path: {
    type: DataTypes.STRING,
    allowNull: true
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
  },
  paiementId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Paiement,
      key: 'id'
    }
  }
}, {
  tableName: 'quittances',
  timestamps: true
});

// Relations
Quittance.belongsTo(Employeur, { foreignKey: 'employeurId', as: 'employeur' });
Quittance.belongsTo(CotisationEmployeur, { foreignKey: 'cotisation_employeurId', as: 'cotisation_employeur' });
Quittance.belongsTo(Paiement, { foreignKey: 'paiementId', as: 'paiement' });

module.exports = Quittance;
