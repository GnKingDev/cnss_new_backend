# Route `GET /api/v1/paiement/list` – Liste des paiements (employé connecté)

Ce document décrit la route **GET `/list`** du module paiement (`db/paiement/route.js`, lignes 220-248). Elle permet à un **employé connecté** (token employé, ex. rôle « Payeur ») de récupérer la **liste paginée des paiements** de **son employeur** : tous les paiements liés aux cotisations de l’entreprise pour laquelle il travaille.

---

## 1. URL et méthode

| Élément | Valeur |
|--------|--------|
| **Méthode** | `GET` |
| **Chemin** | `/list` |
| **URL complète** | **`GET /api/v1/paiement/list`** |
| **Authentification** | **EmployeToken** : `Authorization: Bearer <token_employe>` |

**Important :** cette route est pour un **employé** connecté (pas un employeur). L’employeur est déduit de l’employé : on charge l’employé par `req.user.user_id`, puis son association **employeur** ; la liste des paiements est filtrée par **employeurId** de cet employeur.

---

## 2. Objectif

- Identifier l’**employé** connecté (`req.user.user_id` = id de l’employé).
- Charger l’employé avec son **employeur** (association).
- Si employé ou employeur absent → **404**.
- Récupérer les **paiements** dont `employeurId` = id de l’employeur de l’employé connecté, avec les associations **cotisation_employeur** et **employeur**.
- Retourner une **réponse paginée** (data + pagination).

---

## 3. Requête

- **GET** avec **Authorization: Bearer &lt;token_employe&gt;**.
- **Query (pagination) :**

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `page` | number | Non | Numéro de page (défaut : 1). |
| `limit` | number | Non | Nombre d’éléments par page (défaut : 5, max : 100). |

**Exemple :**

```
GET /api/v1/paiement/list?page=1&limit=5
Authorization: Bearer <token_employe>
```

---

## 4. Réponse 200 (succès)

**Body :** objet avec **data** (tableau des paiements) et **pagination** :

```json
{
  "data": [
    {
      "id": 1,
      "employeurId": 7,
      "cotisation_employeurId": 42,
      "createdAt": "2026-03-15T10:00:00.000Z",
      "cotisation_employeur": {
        "id": 42,
        "periode": "MARS",
        "year": 2026,
        "total_branche": 12937500,
        "facture_path": "/api/v1/docsx/..."
      },
      "employeur": {
        "id": 7,
        "raison_sociale": "Entreprise XYZ",
        "no_immatriculation": "8204000012345"
      }
    }
  ],
  "pagination": {
    "total": 24,
    "page": 1,
    "limit": 5,
    "totalPages": 2
  }
}
```

Chaque élément de **data** est un **paiement** avec les associations **cotisation_employeur** (période, année, montant, facture) et **employeur** (raison sociale, etc.). Les champs exacts dépendent du modèle Paiement et des `attributes` des includes.

---

## 5. Réponses d’erreur

| Statut | Condition | Body |
|--------|-----------|------|
| **404** | Employé non trouvé ou employeur de l’employé absent | `{ "message": "Employé ou employeur non trouvé" }` |
| **400** | Exception (ex. base de données) | `{ "message": "erreur" }` |
| **401** | Token manquant, invalide ou expiré (EmployeToken) | Réponse standard du middleware |

---

## 6. Comportement du front

1. **Contexte** : l’utilisateur est connecté en tant qu’**employé** (ex. rôle Payeur pouvant consulter et initier les paiements de son employeur).
2. **Appel** : `GET /api/v1/paiement/list?page=1&limit=5` avec **Authorization: Bearer &lt;token_employe&gt;**.
3. **Si 200** :
   - Afficher le tableau des paiements (date, période, montant, statut, etc. à partir de **data** et de **cotisation_employeur**).
   - Afficher la pagination avec **pagination.total**, **pagination.page**, **pagination.limit**, **pagination.totalPages**.
4. **Si 404** : afficher « Employé ou employeur non trouvé » (cas rare si le token est cohérent).
5. **Si 400** : afficher « erreur » ou un message générique.
6. **Si 401** : rediriger vers la connexion ou rafraîchir le token.

---

## 7. Différence avec list_for_employeur

| Route | Token | Usage |
|-------|--------|--------|
| **GET /api/v1/paiement/list** | **EmployeToken** | Liste des paiements de l’employeur **de l’employé** connecté (vue employé / payeur). |
| **GET /api/v1/paiement/list_for_employeur** | **EmployeurToken** | Liste des paiements de **l’employeur** connecté (vue employeur). |

Même structure de réponse paginée ; seul le **contexte d’authentification** (employé vs employeur) change.

---

## 8. Récapitulatif

| Élément | Détail |
|--------|--------|
| **Usage** | Liste paginée des **paiements** de l’employeur dont l’**employé** connecté fait partie. |
| **Auth** | **EmployeToken** (employé connecté). |
| **Query** | `page`, `limit` (optionnels). |
| **Réponse 200** | `{ data: [...], pagination: { total, page, limit, totalPages } }`. |
| **Erreurs** | 404 (employé/employeur non trouvé), 400 (erreur), 401 (token). |

Cette route sert à la **vue employé / payeur** qui consulte l’historique des paiements de son entreprise.
