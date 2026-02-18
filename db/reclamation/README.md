# Module Réclamations

APIs du menu Réclamations (stats, liste, détail, création, vérification paiement, document, graphiques).

## Modèle

- **ReclamationDemande** (table `reclamation_demandes`)  
  Champs : `id`, `reference` (REC-YYYY-NNN), `employeur_id`, `type`, `libelle`, `status` (pending | approved | rejected | processing), `progress` (0–100), `date_response`, `document_path`, `documents_complementaires` (JSON), `mois`, `annee`, `periode_verifiee`, `description`.  
  Types : `quittance`, `notification`, `facture`, `certificat`, `annulation`, `rectification`, `correction_naissance`, `correction_genre`, `autre`.

Aucun nouvel attribut n’a été ajouté aux modèles existants (Employeur, Employe, etc.).

## Routes (base `/api/v1/reclamation`)

Toutes protégées par `Authorization: Bearer <token>` (EmployeurToken).

| Méthode | Route | Description |
|--------|--------|-------------|
| GET | `/stats` | Total, approved, processing, rejected |
| GET | `/stats/evolution` | Évolution mensuelle (query: annee, nb_mois) |
| GET | `/stats/repartition` | Répartition par statut (graphique) |
| GET | `/demandes` | Liste (query: recherche, type, statut, page, limit) |
| GET | `/demandes/:id` | Détail + document_url si présent |
| POST | `/demandes` | Création (JSON ou multipart avec document_principal, documents_complementaires) |
| POST | `/verifier-paiement` | Body `mois`, `annee` → infos paiement ou 404 |
| GET | `/demandes/:id/document` | Téléchargement binaire du document principal |

## Migration

```bash
node db/reclamation/migrate.js
```

(Requiert une base MySQL accessible.)

## Vérification paiement

Utilise les tables existantes `cotisation_employeurs` et `paiements` : recherche par `employeurId`, `year`, et `periode` (JANVIER, FEVRIER, …) dérivée du code mois `01`–`12` ou `13`/`14`/`15`.
