# Route `declare-periode` – Déclaration de cotisation et génération de la facture

Ce document décrit la route **POST `/declare-periode`** du module cotisation employeur (`db/cotisation_employeur/route.full.js`, lignes 119-197). Elle permet à l’employeur connecté d’**enregistrer une déclaration de cotisation** pour une période ou un trimestre : création de la cotisation, des lignes de déclaration par employé, du paiement associé, puis **génération du PDF facture** et enregistrement dans l’ancienne base. C’est l’étape qui **écrit en base** après la prévisualisation (`POST /facture`).

---

## Lien / URL de la route

| Élément | Valeur |
|--------|--------|
| **Méthode** | `POST` |
| **Chemin relatif** | `/declare-periode` |
| **URL complète (1)** | **`POST /api/v1/cotisation_employeur/declare-periode`** |
| **URL complète (2)** | `POST /api/cotisations-employeur/declare-periode` |

*Router : `db/cotisation_employeur/route.full.js`, monté sur `/api/v1/cotisation_employeur` et `/api/cotisations-employeur`.*

---

## 1. Objectif

- Vérifier que la **période** ou le **trimestre** n’est pas déjà déclaré pour cet employeur.
- Créer un enregistrement **cotisation_employeur** (totaux, branches, effectifs, dates d’échéance).
- Appliquer la **pénalité** (après le 20 du mois) si applicable.
- Créer les **lignes de déclaration par employé** (Demploye) : salaire, cotisations par employé.
- Créer le **paiement** associé (en attente).
- Générer le **PDF facture** et enregistrer le chemin + document.
- Envoyer la déclaration à l’**ancienne base** (addDeclartionDebit).
- Retourner le chemin du fichier et les infos pénalité.

**Important :** La route exige une **période** valide (nom de mois, ex. `"JANVIER"`) pour calculer `debut_echeance_principal` et `fin_echeance_principal`. Si seul un trimestre est envoyé sans période, `getMonthByName(periode)` renvoie `undefined` et la route répond **400 – Période invalide**. Pour une déclaration par trimestre, il faut fournir une période (ex. premier mois du trimestre) ou adapter le backend.

---

## 2. Requête

- **Méthode :** `POST`
- **URL :** **`POST /api/v1/cotisation_employeur/declare-periode`** (ou `POST /api/cotisations-employeur/declare-periode`).
- **Authentification :** `EmployeurToken` (token employeur obligatoire).

### Body (JSON)

Le body contient **deux blocs principaux** :

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `cotisation_employeur` | object | Oui | Données de la cotisation (période/trimestre, année, totaux, branches, effectifs, etc.). |
| `declaration_employe` | array | Non (défaut `[]`) | Liste des déclarations par employé (salaire, cotisations). |

#### Objet `cotisation_employeur`

Doit contenir au minimum les champs utilisés par le modèle et par la route. Le backend y ajoute `userId` et `employeurId` (depuis le token). Exemples de champs :

| Champ | Type | Description |
|-------|------|-------------|
| `year` | number | Année de la déclaration. |
| `periode` | string | Période (ex. `"JANVIER"`, `"13e MOIS"`). **Requis** pour le calcul des dates d’échéance (sinon 400 – Période invalide). |
| `trimestre` | string/number | Trimestre (si déclaration au trimestre). |
| `total_salary` | number | Somme des salaires bruts. |
| `total_salary_soumis_cotisation` | number | Somme des salaires plafonnés. |
| `total_cotisation_employe` | number | Part cotisation employés. |
| `total_cotisation_employeur` | number | Part cotisation employeur. |
| `total_cotisation` | number | Total cotisations. |
| `total_branche` | number | Montant total branches (à payer). |
| `effectif_embauche` | number | Effectif embauché sur la période. |
| `effectif_leave` | number | Effectif parti. |
| `current_effectif` | number | Effectif actuel. |
| `prestation_familiale` | number | Montant branche prestation familiale. |
| `assurance_maladie` | number | Montant assurance maladie. |
| `risque_professionnel` | number | Montant risque professionnel. |
| `vieillesse` | number | Montant vieillesse. |

Les dates **debut_echeance_principal** et **fin_echeance_principal** sont calculées côté backend à partir de `year` et de `periode` (via `getMonthByName(periode).code`).

#### Tableau `declaration_employe`

Chaque élément est une ligne de déclaration pour un employé. Le backend ajoute `employeurId` et `cotisation_employeurId`. Champs typiques (selon le modèle Demploye) :

| Champ | Type | Description |
|-------|------|-------------|
| `employeId` | number | ID de l’employé. |
| `salary_brut` | number | Salaire brut. |
| `salary_soumis_cotisation` | number | Salaire soumis à cotisation (plafonné). |
| `cotisation_employe` | number | Part employé. |
| `cotisation_emplyeur` | number | Part employeur. |
| `total_cotisation` | number | Total pour cet employé. |
| `periode` | string | (optionnel) Période. |
| `trimestre` | string | (optionnel) Trimestre. |
| `year` | number | (optionnel) Année. |

**Exemple de body :**

```json
{
  "cotisation_employeur": {
    "year": 2025,
    "periode": "JANVIER",
    "total_salary": 62500000,
    "total_salary_soumis_cotisation": 56250000,
    "total_cotisation_employe": 2812500,
    "total_cotisation_employeur": 10125000,
    "total_cotisation": 12937500,
    "total_branche": 12937500,
    "effectif_embauche": 2,
    "effectif_leave": 0,
    "current_effectif": 45,
    "prestation_familiale": 3375000,
    "assurance_maladie": 3656250,
    "risque_professionnel": 2250000,
    "vieillesse": 3656250
  },
  "declaration_employe": [
    {
      "employeId": 101,
      "salary_brut": 1200000,
      "salary_soumis_cotisation": 1200000,
      "cotisation_employe": 60000,
      "cotisation_emplyeur": 216000,
      "total_cotisation": 276000,
      "periode": "JANVIER",
      "year": 2025
    }
  ]
}
```

En pratique, le front réutilise souvent les totaux et la liste obtenus via **POST /facture** et **POST /employe_list**, puis envoie le même contenu structuré ici.

---

## 3. Traitement côté backend (étapes)

### 3.1 Récupération et enrichissement des données

- `data_cotisation_employeur = { ...req.body.cotisation_employeur }`
- `data_declaration_employe = req.body.declaration_employe || []`
- Ajout côté serveur : `data_cotisation_employeur.userId = req.user.id`, `data_cotisation_employeur.employeurId = req.user.user_id`

### 3.2 Période et dates d’échéance

- `monthInfo = getMonthByName(data_cotisation_employeur.periode)`  
  Si **monthInfo** est absent (période non reconnue ou absente) → **400** : `"Période invalide"`.
- `debut_echeance_principal` = premier jour du mois (`year` + `monthInfo.code` + `01`).
- `fin_echeance_principal` = `calculerDates(debut_echeance_principal).dateFinEchange` (dépend de l’ancienne base / config).

### 3.3 Vérification « déjà déclaré »

- Si **periode** est renseignée :  
  `isPeriodeDeclared(periode, year, req.user.user_id)` → si **true** → **400** : `"Cette période a déjà été déclarée"`.
- Sinon (mode trimestre) :  
  `isTrimestreDeclared(trimestre, year, req.user.user_id)` → si **true** → **400** : `"Ce trimestre est déjà déclaré"`.

### 3.4 Création de la cotisation

- `Cemployeur = await cotisation_employeur.create(data_cotisation_employeur)`  
  En base : une ligne dans la table des cotisations employeur (totaux, branches, effectifs, dates, etc.).

### 3.5 Pénalité (après le 20)

- Si `hasPassed20th()` est **true** :  
  `Cemployeur.is_penalite_applied = true`  
  `Cemployeur.penelite_amount = getPenaliteAmount(Cemployeur.total_branche)`  
  Puis `await Cemployeur.save()`.

### 3.6 Création des déclarations employés

- Pour chaque élément de `data_declaration_employe` : ajout de `employeurId` et `cotisation_employeurId: Cemployeur.id`.
- `await Demploye.bulkCreate(declWithIds)` : création de toutes les lignes de déclaration (table declaration-employe).

### 3.7 Création du paiement

- `await paiement.create({ cotisation_employeurId: Cemployeur.id, employeurId: req.user.user_id })`  
  Un paiement « en attente » est créé pour cette cotisation.

### 3.8 Génération du PDF et enregistrement document

- Nom du fichier : selon `periode` ou `trimestre` + year + code unique.
- `getFileAppelCotisation(fileName, Cemployeur, 'FACTURE', EmployeurRecord, code)` : génération du PDF facture.
- `Cemployeur.facture_path = /api/v1/docsx/${fileName}.pdf` puis `Cemployeur.save()`.
- `document.create({ name, path, employeurId, code })` : enregistrement du document pour l’employeur.

En cas d’erreur dans ce bloc (génération PDF, etc.) → **400** : `"Facture non générée, veuillez réessayer plus tard"`.

### 3.9 Ancienne base

- `addDeclartionDebit(insertToOldb, year+monthCode)` : envoi de la déclaration à l’ancienne base (si configurée).

### 3.10 Réponse succès

- **Statut :** **200**
- **Body :**

```json
{
  "filePath": "Appel_retour_de_cotisation-7-JANVIER-2025-xxxxxxxxx.pdf",
  "is_penalite_applied": true,
  "penelite_amount": 646875
}
```

---

## 4. Erreurs

| Situation | Statut | Message |
|-----------|--------|--------|
| Période absente ou invalide (getMonthByName) | 400 | `"Période invalide"` |
| Période déjà déclarée | 400 | `"Cette période a déjà été déclarée"` |
| Trimestre déjà déclaré | 400 | `"Ce trimestre est déjà déclaré"` |
| Erreur génération PDF / document | 400 | `"Facture non générée, veuillez réessayer plus tard"` |
| Autre exception (validation, base, etc.) | 400 | `error.message` |

---

## 5. Résumé du flux

```
Frontend                              Backend (declare-periode)
   |                                              |
   |  POST /api/v1/cotisation_employeur/declare-periode
   |  Authorization: Bearer <token_employeur>      |
   |  Body: { cotisation_employeur, declaration_employe }
   |---------------------------------------------->|
   |                                              |
   |    1. Enrichir cotisation_employeur (userId, employeurId)
   |    2. monthInfo = getMonthByName(periode) → invalide ? 400
   |    3. Calculer debut/fin échéance
   |    4. Période/trimestre déjà déclaré ? → 400
   |    5. cotisation_employeur.create()
   |    6. Après le 20 ? → pénalité + save
   |    7. Demploye.bulkCreate(declaration_employe + ids)
   |    8. paiement.create()
   |    9. getFileAppelCotisation (PDF) → erreur ? 400
   |   10. Mettre à jour facture_path, document.create
   |   11. addDeclartionDebit (ancienne base)
   |<----------------------------------------------|
   |  200 + { filePath, is_penalite_applied, penelite_amount }
   |  ou 400 + message d’erreur
```

---

## 6. Enchaînement typique avec les autres routes

| Étape | Route | Rôle |
|-------|--------|------|
| 1 | **POST /facture** | Prévisualisation des totaux (aucune écriture). |
| 2 | **POST /employe_list** | Liste des employés avec cotisations (pour construire `declaration_employe`). |
| 3 | **POST /declare-periode** | Envoi des totaux + liste → création cotisation, déclarations, paiement, PDF facture. |

Le front appelle en général **/facture** pour afficher le montant, puis **/declare-periode** avec les mêmes données (+ détail par employé) pour enregistrer et générer la facture.
