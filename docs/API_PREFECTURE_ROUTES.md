# Routes Préfectures – Réception et réponses

**Base URL :** `/api/v1/prefecture`

Ce document décrit comment le front envoie les requêtes et comment le backend répond pour les préfectures (liste complète, par ID, par code, par pays).

---

## 1. Récupérer toutes les préfectures

**Route :** `GET /api/v1/prefecture/get_all_prefecture`  
**Objectif :** Obtenir la liste de toutes les préfectures (avec filtres optionnels). Route **publique** (pas de token).

### 1.1 Comment le front envoie la requête

- **Méthode :** `GET`
- **URL :** `/api/v1/prefecture/get_all_prefecture`

#### Headers

Aucun header obligatoire (pas d’authentification).

#### Query (paramètres optionnels)

| Paramètre | Type   | Obligatoire | Description |
|-----------|--------|-------------|-------------|
| `paysId`  | number | Non         | Filtrer les préfectures par ID du pays. |
| `search`  | string | Non         | Recherche dans le nom de la préfecture (`LIKE %search%`). |

**Exemples d’URL :**

- Toutes les préfectures :  
  `GET /api/v1/prefecture/get_all_prefecture`
- Par pays :  
  `GET /api/v1/prefecture/get_all_prefecture?paysId=1`
- Par recherche sur le nom :  
  `GET /api/v1/prefecture/get_all_prefecture?search=conakry`

---

### 1.2 Comment le backend répond

#### Succès (200)

- **Quand :** la liste a été récupérée (éventuellement filtrée).
- **Body :** tableau d’objets préfecture. Chaque élément contient les champs du modèle + l’association `pays` (id, name, code).

**Exemple :**

```json
[
  {
    "id": 1,
    "name": "Conakry",
    "code": "CNK",
    "paysId": 1,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z",
    "pays": {
      "id": 1,
      "name": "Guinée",
      "code": "GN"
    }
  },
  {
    "id": 2,
    "name": "Kindia",
    "code": "KND",
    "paysId": 1,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z",
    "pays": {
      "id": 1,
      "name": "Guinée",
      "code": "GN"
    }
  }
]
```

Si aucun filtre : la réponse peut être mise en cache (Redis) pendant 24 h.

#### Erreur serveur (500)

```json
{
  "message": "Erreur lors de la récupération des préfectures",
  "detail": "…"
}
```

`detail` n’est présent qu’en environnement `development`.

---

## 2. Récupérer une préfecture par ID

**Route :** `GET /api/v1/prefecture/:id`  
**Route publique.**

### Requête

- **Méthode :** `GET`
- **URL :** `/api/v1/prefecture/123` (ex. id = 123)

### Réponses

| Situation      | Statut | Body |
|----------------|--------|------|
| Trouvée        | 200    | Objet préfecture (avec `pays`) |
| `id` invalide  | 400    | `{ "message": "ID invalide" }` |
| Non trouvée    | 404    | `{ "message": "Préfecture non trouvée" }` |
| Erreur serveur | 500    | `{ "message": "Erreur serveur" }` |

---

## 3. Récupérer une préfecture par code

**Route :** `GET /api/v1/prefecture/by_code/:code`  
**Route publique.**

### Requête

- **Méthode :** `GET`
- **URL :** `/api/v1/prefecture/by_code/CNK` (ex. code = CNK)

### Réponses

| Situation      | Statut | Body |
|----------------|--------|------|
| Trouvée        | 200    | Objet préfecture (avec `pays`) |
| Non trouvée    | 404    | `{ "message": "Préfecture non trouvée" }` |
| Erreur serveur | 500    | `{ "message": "Erreur serveur" }` |

---

## 4. Récupérer les préfectures d’un pays

**Route :** `GET /api/v1/prefecture/by_pays/:paysId`  
**Route publique.**

### Requête

- **Méthode :** `GET`
- **URL :** `/api/v1/prefecture/by_pays/1` (ex. paysId = 1)

### Réponses

| Situation      | Statut | Body |
|----------------|--------|------|
| Succès         | 200    | Tableau de préfectures (avec `pays`) |
| `paysId` invalide | 400 | `{ "message": "ID pays invalide" }` |
| Erreur serveur | 500    | `{ "message": "Erreur serveur" }` |

---

## 5. Récapitulatif – Toutes les préfectures

| Action        | Méthode | URL | Auth | Réponse 200 |
|---------------|---------|-----|------|-------------|
| Toutes        | GET     | `/api/v1/prefecture/get_all_prefecture` | Non | Tableau de préfectures |
| Filtre pays   | GET     | `/api/v1/prefecture/get_all_prefecture?paysId=1` | Non | Tableau filtré |
| Filtre nom    | GET     | `/api/v1/prefecture/get_all_prefecture?search=conakry` | Non | Tableau filtré |
| Par ID        | GET     | `/api/v1/prefecture/:id` | Non | Objet préfecture |
| Par code      | GET     | `/api/v1/prefecture/by_code/:code` | Non | Objet préfecture |
| Par pays      | GET     | `/api/v1/prefecture/by_pays/:paysId` | Non | Tableau de préfectures |

---

## 6. Exemple d’appel front (toutes les préfectures)

```javascript
// Toutes les préfectures
const response = await fetch('/api/v1/prefecture/get_all_prefecture');
const prefectures = await response.json();

if (response.ok) {
  // prefectures = tableau d'objets { id, name, code, paysId, pays: { id, name, code }, ... }
} else {
  // 500 : prefectures.message pour afficher l'erreur
}

// Avec filtre pays
const resPays = await fetch('/api/v1/prefecture/get_all_prefecture?paysId=1');

// Avec recherche par nom
const resSearch = await fetch('/api/v1/prefecture/get_all_prefecture?search=conakry');
```
