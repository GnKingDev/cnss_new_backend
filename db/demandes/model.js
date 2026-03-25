const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employeur = require('../XYemployeurs/model');
const Users = require('../users/model');
const DirgaU = require('../admin/model');

const Demande = sequelize.define('demande', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  motif: {
    type: DataTypes.STRING,
    allowNull: true
  },
  response_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'En cours de traitement'
  },
  dirga_traite: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  DG_traite: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  DG_reject_motif: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  DG_response_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  response: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  send_rapport_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  resume_traitement: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  motif_reject: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  doc_path: {
    type: DataTypes.STRING,
    allowNull: true
  },
  rccm_file: {
    type: DataTypes.STRING,
    allowNull: true
  },
  nif_file: {
    type: DataTypes.STRING,
    allowNull: true
  },
  dsn_file: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_re_send: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hide_re_send: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  quitus_path: {
    type: DataTypes.STRING,
    allowNull: true
  },
  reference: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  letter_file: {
    type: DataTypes.STRING,
    allowNull: true
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 3
  },
  is_delivred: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  date_delivry: {
    type: DataTypes.DATE,
    allowNull: true
  },
  quitus_expire_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  date_gen_quitus: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_quittance: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_send_to_dirga: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  rapport_file: {
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
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Users,
      key: 'id'
    }
  },
  dirgaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: DirgaU,
      key: 'id'
    }
  }
}, {
  tableName: 'demandes',
  timestamps: true
});

// Relations
Demande.belongsTo(Employeur, { foreignKey: 'employeurId', as: 'employeur' });
Demande.belongsTo(Users, { foreignKey: 'userId', as: 'user' });
Demande.belongsTo(DirgaU, { foreignKey: 'dirgaId', as: 'dirga' });

module.exports = Demande;
