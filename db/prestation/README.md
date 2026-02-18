# Module Prestations (Pensions)

Modèle et APIs pour le menu **Prestations** (demandes de mise à la retraite / pensions).

## Modèles

- **PrestationDemande** (`prestation_demandes`) : demande de pension (brouillon ou soumise), liée à un employeur et un employé.
- **PrestationDocument** (`prestation_documents`) : pièces jointes (un enregistrement par fichier uploadé par type de pièce).

## Création des tables

Si vous utilisez `sequelize.sync()` au démarrage, les tables seront créées automatiquement. Sinon, exécutez une migration ou créez les tables manuellement (schéma déduit de `model.js` et `documentModel.js`).

## Routes (base : `/api/v1/prestations`)

| Méthode | Route | Description |
|--------|--------|-------------|
| GET | `/stats` | Compteurs tableau de bord : `brouillons`, `demandes_en_cours`, `a_completer`, `validees_ce_mois` (données réelles, pas de mock). |
| GET | `/demandes` | Liste des demandes (filtres: statut, brouillons, date_debut, date_fin, recherche, page, limit). |
| GET | `/demandes/:id` | Détail d'une demande (employer, employee, bank_info, children, documents). |
| POST | `/demandes` | Créer une demande (JSON ou multipart avec champ `demande` + fichiers `document_<type_id>`). |
| PATCH | `/demandes/:id` | Modifier une demande (brouillon ou demande_complements). |
| POST | `/demandes/:id/annuler` | Annuler une demande (brouillon ou soumise) → status `cloturee`. |
| GET | `/pieces-requises` | Liste des pièces à fournir (id, name, description, required, accepted_formats, max_size_mb). |
| GET | `/aide` | Étapes de traitement + FAQ. |
| GET | `/demandes/:id/accuse` | Téléchargement accusé PDF (réponse 501 si non implémenté). |

Toutes les routes sont protégées par **EmployeurToken** (`Authorization: Bearer <token>`).

## Statuts et types

- **Statuts :** `brouillon`, `soumise`, `en_cours`, `demande_complements`, `completee`, `validee`, `rejetee`, `cloturee`.
- **Types de demande :** `retraite_normale`, `retraite_anticipee`, `invalidite`, `autre`.

## Fichiers

Les pièces sont stockées dans **`uploads/prestations/`** et servies via **`/uploads/prestations/...`** (middleware static existant).
