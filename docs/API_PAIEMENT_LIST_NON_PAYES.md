# Route `GET /api/v1/paiement/list_non_payes` – Liste des paiements non payés (statut Nouveau)

Route qui permet à l’**employeur connecté** de récupérer la **liste paginée des paiements non payés** dont le **statut est "Nouveau"** (créés mais pas encore initiés ou en cours).

---

## 1. URL et méthode

| Élément | Valeur |
|--------|--------|
| **Méthode** | `GET` |
| **Chemin** | `/list_non_payes` |
| **URL complète** | **`GET /api/v1/paiement/list_non_payes`** |
| **Authentification** | **EmployeurToken** : `Authorization: Bearer <token_employeur>` |

---

## 2. Critères de filtrage

Sont retournés uniquement les paiements pour lesquels :

- **employeurId** = identifiant de l’employeur connecté (`req.user.user_id`) ;
- **status** = `'Nouveau'` ;
- **is_paid** = `false`.

---

## 3. Requête

- **GET** avec **Authorization: Bearer &lt;token_employeur&gt;**.
- **Query (pagination) :**

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `page` | number | Non | Numéro de page (défaut : 1). |
| `limit` | number | Non | Nombre d’éléments par page (défaut : **5**, max : 100). |

**Exemple :**

```
GET /api/v1/paiement/list_non_payes?page=1&limit=5
Authorization: Bearer <token_employeur>
```

---

## 4. Réponse 200 (succès)

Corps de la réponse : objet paginé (même format que `list` / `list_for_employeur`) :

```json
{
  "data": [
    {
      "id": 1,
      "status": "Nouveau",
      "is_paid": false,
      "cotisation_employeurId": 42,
      "employeurId": 10,
      "createdAt": "...",
      "cotisation_employeur": { ... },
      "employeur": { ... }
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "limit": 5,
    "totalPages": 1
  }
}
```

Chaque élément de `data` inclut les associations **cotisation_employeur** et **employeur**.

---

## 5. Erreurs

| Code | Situation |
|------|-----------|
| **400** | Erreur serveur lors de la récupération (message : *Erreur lors de la récupération des paiements non payés*). |

Les réponses 401/403 sont gérées par le middleware **EmployeurToken** si le token est absent ou invalide.
