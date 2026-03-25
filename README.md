# CNSS Backend

Backend API pour la gestion des cotisations et immatriculations CNSS.

## 📋 Architecture

Le projet suit une architecture modulaire où chaque model correspond à un dossier dans `/db/`. Chaque dossier contient généralement :
- `model.js` : Définition du model Sequelize
- `route.js` : Routes Express pour l'API
- `migrate.js` : Script de migration
- `utility.js` : Fonctions utilitaires

## 🚀 Installation

1. Installer les dépendances :
```bash
npm install
```

2. Configurer les variables d'environnement :
```bash
cp .env.example .env
```

3. Modifier le fichier `.env` avec vos paramètres de base de données :
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=cnss_db
DB_USER=root
DB_PASSWORD=votre_mot_de_passe
PORT=3000
NODE_ENV=development
```

## 🗄️ Base de données

Le projet utilise **Sequelize ORM** avec **MySQL**.

### Migration

Pour créer les tables dans la base de données, exécutez les scripts de migration de chaque model :

```javascript
// Exemple pour migrer un model
const migrate = require('./db/users/migrate');
migrate();
```

Ou utilisez Sequelize CLI pour migrer tous les models.

## 📁 Structure des Models

### Models Référentiels
- `pays` - Référentiel des pays
- `prefecture` - Référentiel des préfectures
- `domain_activite` - Domaines d'activité
- `branches` - Branches d'activité
- `banques` - Référentiel des banques

### Models Principaux
- `users` - Comptes utilisateurs
- `employeur` - Employeurs/Entreprises
- `employe` - Employés
- `cotisation_employeur` - Cotisations des employeurs

### Models de Relations
- `conjoint` - Conjoints des employés
- `enfant` - Enfants des employés
- `carriere` - Historique de carrière
- `declaration-employe` - Déclarations détaillées par employé
- `paiement` - Paiements
- `quittance` - Quittances

### Models de Demandes et Documents
- `demande` - Demandes (quitus, rapports, etc.)
- `adhesion` - Adhésions
- `request_employeur` - Demandes d'immatriculation
- `document` - Documents générés
- `excel_file` - Fichiers Excel
- `quitus` - Quitus
- `succursale` - Succursales

### Models Utilitaires
- `otp` - Codes OTP
- `admin` - Utilisateurs admin (portail BO / DIRGA)
- `affiliation-volontaire` - Affiliations volontaires
- `penalites` - Pénalités

## 🔗 Relations entre Models

Voir le fichier `db/relations.js` pour toutes les relations Sequelize définies.

## 🛣️ API Routes

Toutes les routes sont préfixées par `/api/` :

- `/api/pays`
- `/api/prefectures`
- `/api/activities`
- `/api/branches`
- `/api/banques`
- `/api/users`
- `/api/employeurs`
- `/api/employes`
- `/api/cotisations-employeur`
- `/api/paiements`
- `/api/quittances`
- `/api/demandes`
- ... et plus

## 🚦 Démarrage

```bash
# Mode développement (avec nodemon)
npm run dev

# Mode production
npm start
```

Le serveur démarre sur le port 3000 par défaut (configurable via `PORT` dans `.env`).

## 📝 Notes

- Tous les models ont des timestamps automatiques (`createdAt`, `updatedAt`)
- Les relations Sequelize sont initialisées dans `db/relations.js`
- Chaque model a ses propres routes CRUD dans `route.js`

## 📄 Licence

ISC
