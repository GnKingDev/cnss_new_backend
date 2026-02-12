# Route `employe_list` – Liste des employés pour déclaration de cotisation

Ce document décrit la route **POST `/employe_list`** du module cotisation employeur (`db/cotisation_employeur/route.full.js`, lignes 262-307). Elle permet à l’employeur connecté d’obtenir la **liste paginée de ses employés immatriculés** en vue d’une déclaration, avec pour chaque employé le **salaire soumis à cotisation** et les **montants de cotisation** (employé + employeur) calculés selon la période/trimestre et l’année.

---

## Lien / URL de la route

| Élément | Valeur |
|--------|--------|
| **Méthode** | `POST` |
| **Chemin relatif** | `/employe_list` |
| **URL complète (1)** | **`POST /api/v1/cotisation_employeur/employe_list`** |
| **URL complète (2)** | `POST /api/cotisations-employeur/employe_list` |

*Router : `db/cotisation_employeur/route.full.js`, monté sur `/api/cotisations-employeur` et sur `/api/v1/cotisation_employeur`.*

---

## 1. Objectif

- Vérifier que la **période** ou le **trimestre** choisi n’est pas déjà déclaré pour cet employeur.
- Récupérer les employés **immatriculés** et **encore en poste** (`is_imma: true`, `is_out: false`) de l’employeur.
- Pour chaque employé : calculer le **salaire soumis à cotisation** (plafonné selon l’année) et les **cotisations** (part employé, part employeur, total) selon le **type de contrat** (CDI/CDD vs Stagiaire/Apprenti).
- Retourner une réponse **paginée** (page, pageSize) avec ces données.

---

## 2. Requête

- **Méthode :** `POST`
- **URL :** **`POST /api/v1/cotisation_employeur/employe_list`** (ou `POST /api/cotisations-employeur/employe_list`).
- **Authentification :** `EmployeurToken` (token employeur obligatoire ; `req.user.user_id` = employeur connecté).

### Body (JSON)

Le body doit contenir un objet **`data`** :

| Champ        | Type   | Obligatoire | Description |
|-------------|--------|-------------|-------------|
| `data`      | object | Oui         | Contient les paramètres ci‑dessous. |
| `data.year` | number/string | Oui* | Année de référence pour le calcul (plafond et cotisations). |
| `data.periode` | string | Non  | Période (ex. mois ou 13e/14e/15e mois). Si présent, on vérifie que cette période n’est pas déjà déclarée. |
| `data.trimestre` | string/number | Non | Trimestre. Utilisé si **pas** de `periode` ; on vérifie que ce trimestre n’est pas déjà déclaré. |
| `data.page` | number | Non | Numéro de page (défaut : 1). |
| `data.pageSize` | number | Non | Nombre d’éléments par page (défaut : 10, max : 100). |

\* En pratique, `year` est nécessaire pour les calculs ; s’il manque, les helpers peuvent renvoyer 0 ou des calculs incorrects.

**Exemple :**

```json
{
  "data": {
    "year": 2025,
    "periode": "JANVIER",
    "page": 1,
    "pageSize": 20
  }
}
```

Ou par trimestre (sans `periode`) :

```json
{
  "data": {
    "year": 2025,
    "trimestre": 1,
    "page": 1,
    "pageSize": 10
  }
}
```

---

## 3. Traitement côté backend (étapes)

### 3.1 Vérification du body

- Si `req.body.data` est absent → **400** avec `{ "message": "Données requises" }`.

### 3.2 Vérification « déjà déclaré »

- Si **`data.periode`** est fourni :  
  `isPeriodeDeclared(data.periode, data.year, req.user.user_id)`  
  - Si **true** → **400** : `"La période choisie est déjà déclarée"`.
- Sinon (déclaration par **trimestre**) :  
  `isTrimestreDeclared(data.trimestre, data.year, req.user.user_id)`  
  - Si **true** → **400** : `"Le trimestre choisi est déjà déclaré"`.

Cela évite de lancer une nouvelle déclaration pour une période/trimestre déjà déclarée.

### 3.3 Pagination

- `getPaginationParams(data)` lit `data.page` et `data.pageSize` (défaut : page 1, pageSize 10 ; pageSize plafonné à 100).
- Retourne `{ page, pageSize, offset, limit }` pour la requête SQL.

### 3.4 Récupération des employés

- **Requête :**  
  `employe.findAndCountAll({ where: { employeurId: req.user.user_id, is_imma: true, is_out: false }, raw: true, limit, offset, order: [['createdAt', 'DESC']] })`
- Seuls les employés **immatriculés** et **encore en poste** de l’employeur connecté sont listés.

### 3.5 Cas « aucun employé »

- Si `employesList.length === 0` et `totalItems === 0` → **400** avec `{ "message": "Aucun employé immatriculé pour le moment" }`.

### 3.6 Calculs par employé

Pour chaque élément de la liste :

1. **Salaire soumis à cotisation**  
   `salary_soumis_cotisation = getSalarySoumisCotisation(element.salary, data.year)`  
   - Utilise le plafond annuel (ex. 2 500 000 FCFA à partir de 2019, 1 500 000 avant) et un minimum (ex. 550 000).  
   - Le salaire est borné entre min et plafond.

2. **Plafond**  
   Ici le code utilise `plafond = salary_soumis_cotisation` (même valeur).

3. **Cotisations**  
   `cot = getCotisationForEmployee(plafond, element.type_contrat)`  
   - **Stagiaire / Apprenti** : taux employeur seul (ex. 4 %), part employé = 0.  
   - **Autres contrats** : part employé (ex. 5 %) et part employeur (ex. 18 %), total = somme des deux.  
   - Les noms de champs retournés dans la réponse sont : `cotisation_employe`, `cotisation_emplyeur` (typo côté code), `total_cotisation`.

4. **Objet renvoyé pour chaque employé**  
   - Tous les champs de l’employé (`...element`).  
   - En plus :  
     - `salary_soumis_cotisation`  
     - `cotisation_employe`  
     - `cotisation_emplyeur`  
     - `total_cotisation`

### 3.7 Réponse succès

- **Statut :** **200**
- **Body :** `formatPaginatedResponse(fullList, totalItems, page, pageSize)` soit un objet du type :

```json
{
  "totalItems": 45,
  "totalPages": 3,
  "currentPage": 1,
  "pageSize": 20,
  "data": [
    {
      "id": 1,
      "first_name": "...",
      "last_name": "...",
      "salary": 1200000,
      "type_contrat": "CDI",
      "employeurId": 7,
      "is_imma": true,
      "is_out": false,
      "salary_soumis_cotisation": 1200000,
      "cotisation_employe": 60000,
      "cotisation_emplyeur": 216000,
      "total_cotisation": 276000
    }
  ]
}
```

*(Les chiffres sont des exemples ; les vrais montants dépendent des taux et plafonds dans `utility.js`.)*

---

## 4. Erreurs

| Situation | Statut | Message |
|-----------|--------|--------|
| `data` absent | 400 | `"Données requises"` |
| Période déjà déclarée | 400 | `"La période choisie est déjà déclarée"` |
| Trimestre déjà déclaré | 400 | `"Le trimestre choisi est déjà déclaré"` |
| Aucun employé immatriculé | 400 | `"Aucun employé immatriculé pour le moment"` |
| Exception (ex. base, paramètres) | 400 | `error.message` (généralement renvoyé dans le catch) |

---

## 5. Résumé du flux

```
Frontend                                    Backend (employe_list)
   |                                                 |
   |  POST /api/cotisations-employeur/employe_list    |
   |  Authorization: Bearer <token_employeur>         |
   |  Body: { data: { year, periode?, trimestre?,     |
   |                 page?, pageSize? } }             |
   |------------------------------------------------->|
   |                                                 |
   |                    1. data absent ? → 400         |
   |                    2. periode/trimestre déjà     |
   |                       déclaré ? → 400            |
   |                    3. Pagination (page, limit)   |
   |                    4. findAndCountAll employés   |
   |                       (employeurId, is_imma,     |
   |                        is_out: false)           |
   |                    5. Aucun employé ? → 400     |
   |                    6. Pour chaque employé :      |
   |                       - salary_soumis_cotisation |
   |                       - getCotisationForEmployee|
   |                    7. formatPaginatedResponse   |
   |<-------------------------------------------------|
   |  200 + { totalItems, totalPages, currentPage,   |
   |          pageSize, data: [ employés + cotisations ] }
   |  ou 400 + message d’erreur                      |
```

---

## 6. Dépendances utilitaires (résumé)

- **`getPaginationParams(source)`** : extrait `page`, `pageSize`, `offset`, `limit` (défauts et max définis dans le routeur).
- **`isPeriodeDeclared(periode, year, employeurId)`** : indique si la période est déjà déclarée pour cet employeur.
- **`isTrimestreDeclared(trimestre, year, employeurId)`** : idem pour le trimestre.
- **`getSalarySoumisCotisation(salary, year)`** : retourne le salaire plafonné (min/max selon l’année).
- **`getCotisationForEmployee(plafond, type_contrat)`** : retourne `{ cotisation_employe, cotisation_emplyeur, total_cotisation }`.
- **`formatPaginatedResponse(data, totalItems, page, pageSize)`** : forme l’objet de réponse paginée.

Ces helpers sont définis ou importés dans `route.full.js` et `cotisation_employeur/utility.js`.
