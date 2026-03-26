const { DataTypes } = require('sequelize');
const sequelize = require('../db.connection');
const AffiliationVolontaire = require('../affiliation-volontaire/model');

/**
 * Télédéclaration : une ligne par mois par affilié volontaire.
 * Montant calculé via computeSimulationFromAffiliation (utility affiliation-volontaire).
 */
const DeclarationAffiliationVolontaire = sequelize.define('declaration_affiliation_volontaire', {
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
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Année (ex. 2024)'
  },
  periode: {
    type: DataTypes.STRING(2),
    allowNull: false,
    comment: 'Mois "01" à "12"'
  },
  montant_cotisation: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    comment: 'Cotisation mensuelle (GNF), calculée comme la simulation'
  },
  revenu_mensuel: {
    type: DataTypes.BIGINT,
    allowNull: true,
    defaultValue: 0
  },
  revenu_annuel: {
    type: DataTypes.BIGINT,
    allowNull: true,
    defaultValue: 0
  },
  is_paid: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  djomy_transaction_id: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
    comment: 'Transaction ID retourné par Djomy après initiation du paiement'
  },
  djomy_merchant_ref: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
    comment: 'merchantPaymentReference envoyé à Djomy (UUID)'
  },
  djomy_status: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
    comment: 'Dernier statut Djomy reçu (CREATED, PENDING, SUCCESS, CAPTURED, FAILED)'
  },
  payment_method: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
    comment: 'Méthode de paiement utilisée (DJOMY_OM, DJOMY_MOMO, LENGO, etc.)'
  }
}, {
  tableName: 'declaration_affiliation_volontaire',
  timestamps: true,
  indexes: [
    { unique: true, name: 'uniq_decl_av_year_periode', fields: ['affiliationVolontaireId', 'year', 'periode'] }
  ]
});

DeclarationAffiliationVolontaire.belongsTo(AffiliationVolontaire, { foreignKey: 'affiliationVolontaireId', as: 'affiliationVolontaire' });

module.exports = DeclarationAffiliationVolontaire;
