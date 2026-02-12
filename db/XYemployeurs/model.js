const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const RequestEmployeur = require('../request_employeur/model');
const Prefecture = require('../prefecture/model');
const Branche = require('../branches/model');

const Employeur = sequelize.define('Employeur', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  logo: {
    type: DataTypes.TEXT,
    defaultValue: '/uploads/user.png'
  },
  raison_sociale: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  category: {
    type: DataTypes.TEXT,
    defaultValue: 'E-20'
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  adresse: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  sigle: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  solde: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  salaire_initail: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  effectif_femme: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  effectif_homme: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  effectif_apprentis: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  effectif_total: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  agence: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  bp: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  fax: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  portefeuille: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  no_immatriculation: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  no_compte: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  no_rccm: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  rccm_file: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  no_agrement: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  no_dni: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  dni_file: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  secondary_activity: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  date_immatriculation: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_first_embauche: {
    type: DataTypes.DATE,
    allowNull: true
  },
  chiffre_affaire_principale: {
    type: DataTypes.DECIMAL,
    allowNull: true
  },
  chiffre_affaire_secondaire: {
    type: DataTypes.DECIMAL,
    allowNull: true
  },
  date_creation: {
    type: DataTypes.DATE,
    allowNull: true
  },
  forme_juridique: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_new_compamy: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  is_immatriculed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  role: {
    type: DataTypes.TEXT,
    defaultValue: 'employeur'
  },
  number_employe: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  who_valide: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  DPAE_file: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  is_insert_oldDB: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_principal: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  no_maison_mere: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  request_employeurId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: RequestEmployeur,
      key: 'id'
    }
  },
  prefectureId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Prefecture,
      key: 'id'
    }
  },
  brancheId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Branche,
      key: 'id'
    }
  }
}, {
  tableName: 'Employeurs',
  timestamps: true
});

// Relations
Employeur.belongsTo(RequestEmployeur, { foreignKey: 'request_employeurId', as: 'request_employeur' });
Employeur.belongsTo(Prefecture, { foreignKey: 'prefectureId', as: 'prefecture' });
Employeur.belongsTo(Branche, { foreignKey: 'brancheId', as: 'branche' });

module.exports = Employeur;
