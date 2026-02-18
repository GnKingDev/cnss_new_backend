# Module Biométrie

APIs pour le menu **Biométrie** (demandes d'enrôlement, cartes, rendez-vous).

## Modèles

- **BiometrieDemande** (`biometrie_demandes`) : demande biométrique (enrôlement, renouvellement, correction, etc.), liée à un employeur et un employé.
- **BiometrieAgence** (`biometrie_agences`) : agences CNSS pour les RDV.
- **Employe** : champs ajoutés `has_biometric`, `card_expiry`, `biometric_status`.

## Migration

Exécuter `require('./db/biometrie/migrate')()` pour créer/mettre à jour les tables et les champs employé.

## Routes (base : `/api/v1/biometrie`)

| Méthode | Route | Description |
|--------|--------|-------------|
| GET | `/stats` | Stats : total_demandes, en_attente, en_traitement, termines, rejetes, a_enroller |
| GET | `/demandes` | Liste (recherche, type, statut, page, limit). Défaut 5 par page. |
| GET | `/demandes/:id` | Détail (id numérique ou référence BIO-YYYY-NNN) |
| GET | `/employes` | Liste employés avec has_biometric, card_expiry, biometric_status (recherche, sans_biometrie, matricule_debut/fin) |
| POST | `/demandes` | Créer une ou plusieurs demandes (enrôlement multi = une demande par salarié) |
| GET | `/agences` | Liste des agences CNSS (id, nom, adresse, disponible) |
| GET | `/creneaux` | Liste fixe des créneaux horaires |

Toutes les routes sont protégées par **EmployeurToken**.

## Types et statuts

- **Types** : `enrolement`, `mise_a_jour`, `renouvellement`, `remplacement`, `correction`, `rendez_vous`
- **Statuts** : `en_attente`, `planifié`, `en_traitement`, `terminé`, `rejeté`
- **biometric_status** (employé) : `actif`, `en_attente`, `expiré`, `nouveau`
