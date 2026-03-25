const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');

const Adhesion = sequelize.define('adhesion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },

  // ── Représentant légal ─────────────────────────────────
  first_name: { type: DataTypes.STRING, allowNull: true },
  last_name:  { type: DataTypes.STRING, allowNull: true },

  // ── Identification entreprise ──────────────────────────
  raison_sociale:     { type: DataTypes.STRING, allowNull: true },
  sigle:              { type: DataTypes.TEXT,   allowNull: true },
  no_immatriculation: { type: DataTypes.STRING, allowNull: true, unique: true },
  no_rccm:            { type: DataTypes.TEXT,   allowNull: true },
  no_dni:             { type: DataTypes.TEXT,   allowNull: true },
  no_agrement:        { type: DataTypes.TEXT,   allowNull: true },
  no_compte:          { type: DataTypes.TEXT,   allowNull: true },
  forme_juridique:    { type: DataTypes.TEXT,   allowNull: true },
  category:           { type: DataTypes.STRING, allowNull: true },
  main_activity:      { type: DataTypes.BIGINT, allowNull: true },
  secondary_activity: { type: DataTypes.TEXT,   allowNull: true },

  // ── Contact ────────────────────────────────────────────
  phone_number: { type: DataTypes.STRING, allowNull: true },
  email:        { type: DataTypes.STRING, allowNull: true },
  address:      { type: DataTypes.STRING, allowNull: true },
  fax:          { type: DataTypes.STRING, allowNull: true },
  bp:           { type: DataTypes.TEXT,   allowNull: true },  // boîte postale
  agence:       { type: DataTypes.TEXT,   allowNull: true },
  description:  { type: DataTypes.TEXT,   allowNull: true },

  // ── Localisation ───────────────────────────────────────
  prefectureId: { type: DataTypes.INTEGER, allowNull: true },
  brancheId:    { type: DataTypes.INTEGER, allowNull: true },

  // ── Effectifs ──────────────────────────────────────────
  effectif_femme:     { type: DataTypes.BIGINT, defaultValue: 0 },
  effectif_homme:     { type: DataTypes.BIGINT, defaultValue: 0 },
  effectif_apprentis: { type: DataTypes.BIGINT, defaultValue: 0 },

  // ── Données financières ────────────────────────────────
  salaire_initail:           { type: DataTypes.BIGINT,  defaultValue: 0 },
  chiffre_affaire_principale: { type: DataTypes.DECIMAL, allowNull: true },
  chiffre_affaire_secondaire: { type: DataTypes.DECIMAL, allowNull: true },

  // ── Dates importantes ──────────────────────────────────
  date_creation:       { type: DataTypes.DATE, allowNull: true },
  date_first_embauche: { type: DataTypes.DATE, allowNull: true },
  date_immatriculation:{ type: DataTypes.DATE, allowNull: true },

  // ── Fichiers ───────────────────────────────────────────
  rccm_file: { type: DataTypes.TEXT, allowNull: true },
  nif_file:  { type: DataTypes.TEXT, allowNull: true },

  // ── Workflow adhésion ──────────────────────────────────
  active_btn: { type: DataTypes.BOOLEAN, defaultValue: false },
  who_valid:  { type: DataTypes.BIGINT,  allowNull: true },
  is_valid:   { type: DataTypes.BOOLEAN, defaultValue: false },
  valid_date: { type: DataTypes.DATE,    allowNull: true },
}, {
  tableName: 'adhesions',
  timestamps: true,
});

module.exports = Adhesion;
