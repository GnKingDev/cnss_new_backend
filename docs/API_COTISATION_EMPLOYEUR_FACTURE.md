# Route `facture` – Calcul / prévisualisation de la facture de cotisation

Ce document décrit la route **POST `/facture`** du module cotisation employeur (`db/cotisation_employeur/route.full.js`, lignes 200-259). Elle permet à l’employeur connecté d’obtenir le **calcul (prévisualisation) d’une facture** pour une période ou un trimestre : totaux salaires, cotisations, branches, et éventuellement pénalité. **Aucune donnée n’est enregistrée en base** ; c’est un calcul à la volée pour afficher le montant avant de déclarer.

---

## Lien / URL de la route

| Élément | Valeur |
|--------|--------|
| **Méthode** | `POST` |
| **Chemin relatif** | `/facture` |
| **URL complète (1)** | **`POST /api/v1/cotisation_employeur/facture`** |
| **URL complète (2)** | `POST /api/cotisations-employeur/facture` |

*Router : `db/cotisation_employeur/route.full.js`, monté sur `/api/v1/cotisation_employeur` et `/api/cotisations-employeur`.*

---

## 1. Objectif

- Vérifier que la **période** ou le **trimestre** choisi n’est pas déjà déclaré pour cet employeur.
- Récupérer **tous les employés immatriculés** de l’employeur (`is_imma: true`).
- Pour chaque employé : salaire soumis à cotisation, cotisations (employé + employeur), et effet sur les branches (prestation familiale, assurance maladie, etc.).
- Calculer les **montants par branche** et le **total branche**.
- Si la date du jour est **après le 20** du mois : appliquer la **pénalité** (ex. 5 % du total branche).
- Retourner un objet **prévisualisation** (aucune création en base, ni cotisation ni déclaration).

---

## 2. Requête

- **Méthode :** `POST`
- **URL :** **`POST /api/v1/cotisation_employeur/facture`** (ou `POST /api/cotisations-employeur/facture`).
- **Authentification :** `EmployeurToken` (token employeur obligatoire).

### Body (JSON)

Le body doit contenir un objet **`data`** :

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `data` | object | Oui | Contient les paramètres ci‑dessous. |
| `data.year` | number/string | Oui* | Année de référence pour les calculs (plafond, cotisations). |
| `data.periode` | string | Conditionnel | Période (ex. `"JANVIER"`, `"13e MOIS"`). **Requis** si pas de `trimestre`. |
| `data.trimestre` | string/number | Conditionnel | Trimestre. **Requis** si pas de `periode`. |

*Il faut soit `data.periode`, soit `data.trimestre` (au moins un des deux).*

**Exemple par période :**

```json
{
  "data": {
    "year": 2025,
    "periode": "JANVIER"
  }
}
```

**Exemple par trimestre :**

```json
{
  "data": {
    "year": 2025,
    "trimestre": 1
  }
}
```

---

## 3. Traitement côté backend (étapes)

### 3.1 Vérification du body

- Si `data` est absent, ou si **ni** `data.periode` **ni** `data.trimestre` ne sont fournis → **400** : `"Période ou trimestre requis"`.

### 3.2 Vérification « déjà déclaré »

- Si **`data.periode`** est fourni :  
  `isPeriodeDeclared(data.periode, data.year, req.user.user_id)`  
  - Si **true** → **400** : `"Cette période a déjà été déclarée"`.
- Sinon (mode **trimestre**) :  
  `isTrimestreDeclared(data.trimestre, data.year)`  
  - Si **true** → **400** : `"Ce trimestre est déjà déclaré"`.

### 3.3 Initialisation des totaux

- `sendData = buildSendDataBase(data.year, data.periode)` : objet avec totaux à 0 (total_salary, total_salary_soumis_cotisation, total_cotisation_employe, total_cotisation_employeur, total_cotisation, effectif_embauche, current_effectif, branches, total_branche, is_penalite_applied, penelite_amount, etc.).

### 3.4 Récupération des employés

- **Requête :**  
  `employe.findAll({ where: { employeurId: req.user.user_id, is_imma: true } })`  
  Tous les employés **immatriculés** de l’employeur (sans filtre `is_out` ici).

### 3.5 Cas « aucun employé »

- Si la liste est vide → **400** : `"Aucun employé immatriculé pour le moment"`.

### 3.6 Boucle sur chaque employé

Pour chaque employé :

1. **Effectif embauche (mois de la période)**  
   Si une `periode` est fournie et que l’employé a été créé le même mois que cette période → `sendData.effectif_embauche += 1`.

2. **Salaire total**  
   `sendData.total_salary += element.salary`  
   `sendData.current_effectif = EmployeList.length`

3. **Salaire soumis à cotisation**  
   `employe_salary_soumis = getSalarySoumisCotisation(element.salary, data.year)` (plafonné selon l’année).  
   `sendData.total_salary_soumis_cotisation += employe_salary_soumis`

4. **Cotisations**  
   `cot = getCotisationForEmployee(plafond, element.type_contrat)`  
   - Stagiaire / Apprenti : part employeur seule ; somme des plafonds stagiaires/apprentis pour les branches.  
   - Autres : part employé + part employeur.  
   Ensuite :  
   `sendData.total_cotisation_employe += cot.cotisation_employe`  
   `sendData.total_cotisation_employeur += cot.cotisation_emplyeur`  
   `sendData.total_cotisation += cot.total_cotisation`

### 3.7 Montants par branche

- `branches = computeBranches(sendData.total_salary_soumis_cotisation, get_ssc_stagiare_apprentis)`  
  Retourne : `prestation_familiale`, `assurance_maladie`, `risque_professionnel`, `vieillesse`, `total_branche`.
- Ces champs sont recopiés dans `sendData` ; `sendData.total_branche = branches.total_branche`.

### 3.8 Pénalité (après le 20)

- Si `hasPassed20th()` est **true** (date du jour > 20 du mois) :  
  `sendData.is_penalite_applied = true`  
  `sendData.penelite_amount = getPenaliteAmount(sendData.total_branche)` (ex. 5 % du total_branche).

### 3.9 Réponse succès

- **Statut :** **200**
- **Body :** l’objet `sendData` complet (prévisualisation de la facture).

**Exemple de structure de réponse 200 :**

```json
{
  "year": 2025,
  "periode": "JANVIER",
  "trimestre": null,
  "effectif_embauche": 2,
  "effectif_leave": 0,
  "current_effectif": 45,
  "total_salary": 62500000,
  "total_salary_soumis_cotisation": 56250000,
  "total_cotisation_employe": 2812500,
  "total_cotisation_employeur": 10125000,
  "total_cotisation": 12937500,
  "prestation_familiale": 3375000,
  "assurance_maladie": 3656250,
  "risque_professionnel": 2250000,
  "vieillesse": 3656250,
  "total_branche": 12937500,
  "is_penalite_applied": true,
  "penelite_amount": 646875
}
```

*(Les chiffres sont des exemples ; les vrais montants dépendent des taux dans `utility.js` et de la date pour la pénalité.)*

---

## 4. Erreurs

| Situation | Statut | Message |
|-----------|--------|--------|
| `data` absent ou ni période ni trimestre | 400 | `"Période ou trimestre requis"` |
| Période déjà déclarée | 400 | `"Cette période a déjà été déclarée"` |
| Trimestre déjà déclaré | 400 | `"Ce trimestre est déjà déclaré"` |
| Aucun employé immatriculé | 400 | `"Aucun employé immatriculé pour le moment"` |
| Exception (calcul, base, etc.) | 400 | `"Calcul facture impossible, veuillez réessayer"` |

---

## 5. Résumé du flux

```
Frontend                              Backend (facture)
   |                                          |
   |  POST /api/v1/cotisation_employeur/facture
   |  Authorization: Bearer <token_employeur>  |
   |  Body: { data: { year, periode? | trimestre? } }
   |----------------------------------------->|
   |                                          |
   |           1. data / période ou trimestre ? → 400
   |           2. période/trimestre déjà déclaré ? → 400
   |           3. buildSendDataBase(year, periode)
   |           4. findAll employés (employeurId, is_imma: true)
   |           5. Aucun employé ? → 400
   |           6. Pour chaque employé : SSC, cotisations, effectif embauche
   |           7. computeBranches → total_branche, etc.
   |           8. Après le 20 ? → is_penalite_applied, penelite_amount
   |<------------------------------------------|
   |  200 + sendData (prévisualisation)        |
   |  ou 400 + message d’erreur                |
```

---

## 6. Différence avec `declare-periode` et `employe_list`

| Route | Rôle |
|-------|------|
| **POST /facture** | **Calcul uniquement** : renvoie les totaux (prévisualisation). Aucune écriture en base. |
| **POST /declare-periode** | Crée la cotisation, les déclarations employés, le paiement et génère le PDF facture. |
| **POST /employe_list** | Liste paginée des employés avec cotisations par employé (pour choisir les employés à déclarer). |

On appelle en général **`/facture`** pour afficher le montant à l’utilisateur, puis **`/declare-periode`** pour enregistrer la déclaration et générer la facture.
