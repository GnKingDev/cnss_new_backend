# Déclaration complémentaire – Comportement du front

Ce document décrit comment le **front** doit se comporter pour la **déclaration complémentaire** de cotisation. Une déclaration complémentaire concerne une **période déjà déclarée** (déclaration principale déjà faite) : l’employeur déclare à nouveau pour la même période (ex. ajout d’employés ou correction). Le flux repose sur **trois routes** à enchaîner.

**Base URL :** `/api/v1/cotisation_employeur` (ou `/api/cotisations-employeur`)  
**Authentification :** toutes les routes exigent **EmployeurToken** (`Authorization: Bearer <token_employeur>`).

---

## 1. Vue d’ensemble du flux

| Étape | Route | Rôle |
|-------|--------|------|
| 1 | **POST /complementaire_list** | Vérifier que la période est déjà déclarée, puis récupérer la **liste paginée** des employés immatriculés avec cotisations calculées. |
| 2 | **POST /complementaire_facture** | Envoyer la liste choisie (`bulk`) et obtenir le **calcul (prévisualisation)** de la facture complémentaire (totaux, branches). |
| 3 | **POST /complementaire_declaration** | Envoyer les totaux + lignes de déclaration pour **créer** la déclaration complémentaire et **générer le PDF** facture. |

**Règle importante :** la **période doit déjà avoir été déclarée** (déclaration principale) avant d’utiliser la complémentaire. Sinon `complementaire_list` renvoie 400.

---

## 2. Étape 1 – Liste des employés (complementaire_list)

### 2.1 Requête

- **Méthode :** `POST`
- **URL :** `POST /api/v1/cotisation_employeur/complementaire_list`
- **Headers :** `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Body (JSON) :**

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `periode` | string | **Oui** | Période concernée (ex. `"JANVIER"`, `"MARS"`). |
| `year` | number/string | Oui* | Année. |
| `page` | number | Non | Page (défaut 1). |
| `pageSize` | number | Non | Éléments par page (défaut 10, max 100). |

\* En pratique nécessaire pour les calculs.

**Exemple :**

```json
{
  "periode": "MARS",
  "year": 2026,
  "page": 1,
  "pageSize": 20
}
```

### 2.2 Réponses

**200 (succès)**  
- La période est déjà déclarée et il y a des employés immatriculés.
- **Body :** objet paginé `{ totalItems, totalPages, currentPage, pageSize, data }`.
- **`data`** : tableau d’employés avec, pour chacun : champs employé + `salary_soumis_cotisation`, `cotisation_employe`, `cotisation_emplyeur`, `total_cotisation`.

**400 (erreur)**  
- `"Période requise"` : `periode` absent.
- `"Cette période doit être déclarée d'abord avant une déclaration complémentaire."` : la période n’a pas encore été déclarée en principal → le front doit d’abord proposer la déclaration principale ou une autre période.
- `"Aucun employé immatriculé pour le moment"` : aucun employé éligible.
- `"Erreur, veuillez réessayer"` : exception.

### 2.3 Comportement du front

1. Saisir ou sélectionner **période** et **année** (période = une déjà déclarée).
2. Appeler **POST /complementaire_list** avec `{ periode, year, page?, pageSize? }`.
3. Si **200** : afficher la liste (tableau) et la pagination ; permettre à l’utilisateur de **sélectionner** les employés à inclure dans la complémentaire (ou tout sélectionner).
4. Si **400** « période doit être déclarée d’abord » : afficher ce message et ne pas continuer vers la facture complémentaire pour cette période.

---

## 3. Étape 2 – Calcul / prévisualisation (complementaire_facture)

### 3.1 Requête

- **Méthode :** `POST`
- **URL :** `POST /api/v1/cotisation_employeur/complementaire_facture`
- **Headers :** `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Body (JSON) :**

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `year` | number/string | Oui | Année. |
| `periode` | string | Oui | Période (ex. `"MARS"`). |
| `bulk` | array | Oui | Liste des employés **choisis** (issus de complementaire_list), chacun avec au minimum : `salary`, `salary_soumis_cotisation`, `cotisation_employe`, `cotisation_emplyeur`, `total_cotisation`, `type_contrat`, `createdAt`. |

**Exemple :**

```json
{
  "year": 2026,
  "periode": "MARS",
  "bulk": [
    {
      "id": 1,
      "first_name": "Mamadou",
      "last_name": "Diallo",
      "salary": 1200000,
      "salary_soumis_cotisation": 1200000,
      "cotisation_employe": 60000,
      "cotisation_emplyeur": 216000,
      "total_cotisation": 276000,
      "type_contrat": "CDI",
      "createdAt": "2025-01-15T10:00:00.000Z"
    }
  ]
}
```

### 3.2 Réponse 200

- **Body :** objet de type « facture » (totaux, branches) : `year`, `periode`, `current_effectif`, `effectif_embauche`, `total_salary`, `total_salary_soumis_cotisation`, `total_cotisation_employe`, `total_cotisation_employeur`, `total_cotisation`, `prestation_familiale`, `assurance_maladie`, `risque_professionnel`, `vieillesse`, `total_branche`, etc.  
- **Aucune écriture en base** : simple calcul pour affichage.

### 3.3 Réponse 400

- `"Erreur"` ou message d’exception.

### 3.4 Comportement du front

1. Partir de la **liste obtenue** (et éventuellement filtrée/sélectionnée) après **complementaire_list**.
2. Envoyer en **`bulk`** les éléments retenus pour la complémentaire (avec les champs cotisation + `type_contrat`, `createdAt`).
3. Appeler **POST /complementaire_facture** avec `{ year, periode, bulk }`.
4. Si **200** : afficher le **récapitulatif** (montant total à payer, détail des branches, etc.) avant de lancer la déclaration.
5. Utiliser ces **mêmes totaux** (et la liste détaillée) pour l’étape 3 (**complementaire_declaration**).

---

## 4. Étape 3 – Enregistrement et facture PDF (complementaire_declaration)

### 4.1 Requête

- **Méthode :** `POST`
- **URL :** `POST /api/v1/cotisation_employeur/complementaire_declaration`
- **Headers :** `Content-Type: application/json`, `Authorization: Bearer <token>`
- **Body (JSON) :** même logique que **declare-periode**, avec un bloc cotisation + un bloc déclarations employés :

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `cotisation_employeur` | object | Oui | Données de la cotisation : `year`, `periode`, totaux (salaires, cotisations, branches, effectifs), etc. Le backend ajoute `userId`, `employeurId` et fixe `motif: 'FACTURATION COMPLEMENTAIRE SUR PRINCIPAL'`. |
| `declaration_employe` | array | Non (défaut `[]`) | Lignes de déclaration par employé (employeId, salary_brut, salary_soumis_cotisation, cotisation_employe, cotisation_emplyeur, total_cotisation, etc.). |

**Exemple (structure) :**

```json
{
  "cotisation_employeur": {
    "year": 2026,
    "periode": "MARS",
    "total_salary": 5000000,
    "total_salary_soumis_cotisation": 5000000,
    "total_cotisation_employe": 250000,
    "total_cotisation_employeur": 900000,
    "total_cotisation": 1150000,
    "total_branche": 1150000,
    "effectif_embauche": 0,
    "current_effectif": 5,
    "prestation_familiale": 300000,
    "assurance_maladie": 325000,
    "risque_professionnel": 200000,
    "vieillesse": 325000
  },
  "declaration_employe": [
    {
      "employeId": 1,
      "salary_brut": 1200000,
      "salary_soumis_cotisation": 1200000,
      "cotisation_employe": 60000,
      "cotisation_emplyeur": 216000,
      "total_cotisation": 276000
    }
  ]
}
```

En pratique, le front peut reprendre les **totaux** de la réponse **complementaire_facture** et les **lignes** construites à partir du **bulk** (ou de complementaire_list) pour remplir `cotisation_employeur` et `declaration_employe`.

### 4.2 Réponse 200

- **Body :** `{ "filePath": "Facture_complementaire-xxx.pdf" }`
- La déclaration est créée, le PDF est généré et enregistré sous `/api/v1/docsx/<filePath>`.

**Comportement du front :** proposer le **téléchargement ou l’affichage** du PDF via l’URL complète du backend (ex. `GET /api/v1/docsx/Facture_complementaire-xxx.pdf`).

### 4.3 Réponse 400

- `"Période invalide"` : période non reconnue.
- `"Facture non générée, veuillez réessayer plus tard"` : erreur lors de la génération du PDF.
- Autre message d’exception dans `message`.

---

## 5. Parcours utilisateur recommandé (résumé)

1. **Choix de la période**  
   L’utilisateur choisit une **période déjà déclarée** (ex. MARS 2026).

2. **Liste des employés**  
   - Appel **POST /complementaire_list** avec `{ periode, year, page?, pageSize? }`.  
   - Si 400 « période doit être déclarée d’abord » → afficher le message et bloquer la suite.  
   - Si 200 → afficher la liste paginée et permettre la **sélection** des employés à inclure dans la complémentaire.

3. **Prévisualisation**  
   - Appel **POST /complementaire_facture** avec `{ year, periode, bulk }` (liste des employés sélectionnés avec leurs champs cotisation).  
   - Afficher le **récapitulatif** (totaux, total_branche).

4. **Déclaration**  
   - Appel **POST /complementaire_declaration** avec `cotisation_employeur` (totaux) et `declaration_employe` (lignes par employé).  
   - En cas de 200 : afficher ou télécharger la **facture PDF** via l’URL retournée (`filePath`).

---

## 6. Récapitulatif des trois routes

| Route | Méthode | Body principal | Réponse 200 |
|-------|--------|----------------|-------------|
| **/complementaire_list** | POST | `{ periode, year, page?, pageSize? }` | Liste paginée d’employés avec cotisations |
| **/complementaire_facture** | POST | `{ year, periode, bulk }` | Totaux et branches (prévisualisation) |
| **/complementaire_declaration** | POST | `{ cotisation_employeur, declaration_employe }` | `{ filePath: "xxx.pdf" }` |

Toutes en **POST**, avec **Authorization: Bearer &lt;token_employeur&gt;** et **Content-Type: application/json** (sauf si précisé autrement). Le front enchaîne ces trois appels dans l’ordre et gère les 400 (messages d’erreur en français) pour guider l’utilisateur.
