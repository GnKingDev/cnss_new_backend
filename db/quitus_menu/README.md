# Module Menu Quitus

APIs du menu Quitus (Demande de Quitus / Attestation de situation régulière) : wizard 3 étapes, stats, liste, téléchargements.

## Règle métier

**L'employeur ne peut déposer une demande de quitus que si les cotisations de la période sont payées.**  
Le backend vérifie `cotisation_employeurs.is_paid` lors de POST /demandes et renvoie 400 sinon.

## Modèle

- **QuitusDemande** (table `quitus_demandes`)  
  Champs : `id`, `reference` (QUI-YYYY-NNN), `employeur_id`, `cotisation_employeur_id`, `mois`, `annee`, `periode`, `statut` (en_cours | valide), `montant`, `document_path`, `document_rccm`, `document_nif`.

Aucun nouvel attribut sur les modèles existants (Employeur, CotisationEmployeur, etc.).

## Routes (base `/api/v1/quitus`)

Toutes protégées par `Authorization: Bearer <token>` (EmployeurToken).

| Méthode | Route | Description |
|---------|--------|-------------|
| GET | `/stats` | total, en_cours, validees |
| GET | `/derniere-declaration` | Dernière déclaration + facture + employés (étape 1) |
| POST | `/verifier-paiement` | Body mois, annee → infos paiement + quittance (étape 2) |
| GET | `/documents-enregistres` | RCCM/NIF déjà uploadés (étape 3) |
| POST | `/demandes` | Créer demande (JSON ou multipart ; vérifie cotisations payées) |
| GET | `/demandes` | Liste avec pagination (statut, page, limit) |
| GET | `/demandes/:id` | Détail |
| GET | `/facture/:id` | Télécharger facture de déclaration (id = cotisation_employeur_id) |
| GET | `/quittance/:id` | Télécharger quittance (id = quittance_id) |
| GET | `/demandes/:id/document` | Télécharger attestation quitus (uniquement si statut=valide) |

## Migration

```bash
node db/quitus_menu/migrate.js
```
