const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const Employe = require('../employe/model');

const STATUTS = ['en_attente', 'traitee', 'rejetee'];

const DemandeAccesEmploye = sequelize.define('demande_acces_employe', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  reference: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: 'Référence unique générée à la soumission. Ex: ACC-2025-001234',
  },
  no_immatriculation: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Numéro d\'immatriculation saisi par le demandeur',
  },
  prenom: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  nom: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  telephone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  raison_sociale_employeur: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Raison sociale de l\'employeur actuel déclarée par le demandeur',
  },
  piece_identite_path: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Chemin vers la copie de la pièce d\'identité uploadée',
  },
  statut: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'en_attente',
    comment: STATUTS.join(', '),
  },
  note_traitement: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Commentaire laissé par l\'agent lors du traitement',
  },
  date_traitement: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  employeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: Employe, key: 'id' },
    comment: 'Employé trouvé en base lors de la validation du matricule',
  },
}, {
  tableName: 'demande_acces_employe',
  timestamps: true,
  indexes: [
    { fields: ['reference'] },
    { fields: ['no_immatriculation'] },
    { fields: ['statut'] },
    { fields: ['email'] },
  ],
});

DemandeAccesEmploye.belongsTo(Employe, { foreignKey: 'employeId', as: 'employe' });
DemandeAccesEmploye.STATUTS = STATUTS;

module.exports = DemandeAccesEmploye;
