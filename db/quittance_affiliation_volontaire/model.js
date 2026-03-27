const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const AffiliationVolontaire = require('../affiliation-volontaire/model');
const DeclarationAffiliationVolontaire = require('../declaration_affiliation_volontaire/model');

const QuittanceAffiliationVolontaire = sequelize.define('quittance_affiliation_volontaire', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  affiliationVolontaireId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: AffiliationVolontaire, key: 'id' }
  },
  declarationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: DeclarationAffiliationVolontaire, key: 'id' }
  },
  reference: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Référence unique de la quittance (ex: AV-2024-000001-02-2026)'
  },
  secret_code: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Code de vérification unique'
  },
  doc_path: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Chemin du PDF sur disque (/api/v1/docsx/...)'
  },
  montant: {
    type: DataTypes.BIGINT,
    allowNull: true,
    defaultValue: 0
  },
  periode: {
    type: DataTypes.STRING(2),
    allowNull: true,
    comment: 'Mois "01" à "12"'
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  payment_method: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Méthode de paiement (DJOMY_OM, DJOMY_MOMO, etc.)'
  },
  djomy_transaction_id: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'quittance_affiliation_volontaire',
  timestamps: true
});

QuittanceAffiliationVolontaire.belongsTo(AffiliationVolontaire, { foreignKey: 'affiliationVolontaireId', as: 'affiliationVolontaire' });
QuittanceAffiliationVolontaire.belongsTo(DeclarationAffiliationVolontaire, { foreignKey: 'declarationId', as: 'declaration' });

module.exports = QuittanceAffiliationVolontaire;
