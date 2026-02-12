# API Dashboard – Routes pour le frontend

**Base URL :** `/api/v1/employeur`  
**Authentification :** toutes les routes dashboard exigent le **token employeur** dans l’en-tête :

```http
Authorization: Bearer <token>
```

Le token est celui reçu après `POST /api/v1/user/login` + `POST /api/v1/user/verify_otp` (token final employeur). L’employeur est identifié par `req.user.user_id` côté backend.

---

## Synthèse des routes

| Méthode | Route | Description |
|--------|--------|-------------|
| **GET** | `/api/v1/employeur/profile` | Profil entreprise (top bar : raison sociale, n° immatriculation) |
| **GET** | `/api/v1/employeur/dashboard/home` | Tout le dashboard en un appel (recommandé) |
| **GET** | `/api/v1/employeur/dashboard/stats` | KPIs agrégés uniquement |
| **GET** | `/api/v1/employeur/dashboard/employee-situation` | Situation employés (actifs, attente, retraités) |
| **GET** | `/api/v1/employeur/dashboard/pending-payments` | Paiements en attente (nombre + montant GNF) |
| **GET** | `/api/v1/employeur/dashboard/recent-activities` | Activités récentes (avec `?limit=N`) |

---

## 1. Profil employeur (Top Bar – infos entreprise)

### `GET /api/v1/employeur/profile`

Données entreprise de l’employeur connecté : raison sociale et numéro d’immatriculation (pour la zone centre-droit du top bar).

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Réponse 200 :**

```json
{
  "companyName": "CNSS GUINÉE",
  "registrationNumber": "8204000010400"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `companyName` | string | Raison sociale (nom de l’entreprise). |
| `registrationNumber` | string | Numéro d’immatriculation employeur. |

**Erreurs :** 401 (token), 404 (employeur non trouvé).

**Note :** Si le front charge déjà `GET /api/v1/employeur/dashboard/home`, il peut utiliser `response.employeur` (mêmes champs) au lieu d’appeler `/profile` séparément.

---

## 2. Dashboard complet (recommandé)

### `GET /api/v1/employeur/dashboard/home`

Un seul appel pour alimenter toute la page d’accueil. Données du **mois courant** (pas de paramètre `month` pour l’instant).

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Query :** aucun.

**Réponse 200 :**

```json
{
  "employeur": {
    "companyName": "CNSS GUINÉE",
    "registrationNumber": "8204000010400"
  },
  "employees": {
    "total": 1300,
    "addedThisMonth": 12
  },
  "cotisations": {
    "totalGnf": 68000000,
    "evolutionPercent": 15.3,
    "series": [
      { "value": 0 },
      { "value": 42000 },
      { "value": 48000 }
    ]
  },
  "declarations": {
    "total": 156,
    "validated": 153,
    "validationRate": 98
  },
  "pendingPayments": {
    "count": 3,
    "totalGnf": 13123000
  },
  "employeeSituation": {
    "actifs": 1245,
    "enAttente": 32,
    "retires": 23,
    "total": 1300
  },
  "recentActivities": [
    {
      "id": "cot-42",
      "type": "declaration",
      "message": "Déclaration Janvier 2025 validée",
      "time": "Il y a 2h",
      "status": "success"
    },
    {
      "id": "pay-18",
      "type": "payment",
      "message": "Paiement de 9 450 000 GNF effectué",
      "time": "Il y a 5h",
      "status": "success"
    },
    {
      "id": "emp-301",
      "type": "employee",
      "message": "Employé Jean Dupont ajouté",
      "time": "Hier",
      "status": "info"
    }
  ],
  "monthSummary": {
    "month": "2025-01",
    "monthLabel": "janvier 2025",
    "declarationsCount": 12,
    "paymentsCount": 8,
    "requestsPending": 5,
    "declarationsTrend": "+3",
    "paymentsTrend": "+2",
    "requestsTrend": "0"
  },
  "unreadActivitiesCount": 4
}
```

**Champs principaux :**

| Section | Champs | Usage front |
|--------|--------|-------------|
| **Top Bar (entreprise)** | `employeur.companyName`, `employeur.registrationNumber` | Bloc centre-droit : nom entreprise + N° immatriculation |
| **Cartes KPI** | `employees.total`, `employees.addedThisMonth` | Carte « Employés » |
| | `cotisations.totalGnf`, `cotisations.evolutionPercent`, `cotisations.series` | Carte « Cotisations du mois » (montant, %, mini courbe 7 jours) |
| | `declarations.total`, `declarations.validated`, `declarations.validationRate` | Carte « Déclarations » |
| | `pendingPayments.count`, `pendingPayments.totalGnf` | Carte « Paiements en attente » |
| **Situation employés** | `employeeSituation.actifs`, `enAttente`, `retires`, `total` | Bloc situation des employés |
| **Activité récente** | `recentActivities[]` | Liste d’activités (type, message, time, status) |
| **Résumé du mois** | `monthSummary.*` | Déclarations / paiements / demandes du mois + tendances |
| **Badge** | `unreadActivitiesCount` | Nombre d’activités « récentes » (à définir côté front si besoin) |

**Types d’activité :** `declaration` | `payment` | `employee`  
**Status :** `success` | `warning` | `info`

**Erreurs :**  
- **401** — Token manquant, invalide ou session expirée.  
- **500** — Erreur serveur.

---

## 3. Stats (KPIs seuls)

### `GET /api/v1/employeur/dashboard/stats`

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Réponse 200 :**

```json
{
  "totalEmployees": 1300,
  "employeesAddedThisMonth": 12,
  "totalCotisationsGnf": 68000000,
  "totalDeclarations": 156,
  "pendingPaymentsCount": 3
}
```

Période : mois courant.

---

## 4. Situation des employés

### `GET /api/v1/employeur/dashboard/employee-situation`

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Réponse 200 :**

```json
{
  "actifs": 1245,
  "enAttente": 32,
  "retires": 23,
  "total": 1300
}
```

| Champ | Signification |
|-------|----------------|
| `actifs` | Employés immatriculés et non sortis (`is_imma: true`, `is_out: false`) |
| `enAttente` | Employés non encore immatriculés |
| `retires` | Employés sortis (`is_out: true`) |
| `total` | Total employés de l’employeur |

---

## 5. Paiements en attente

### `GET /api/v1/employeur/dashboard/pending-payments`

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Réponse 200 :**

```json
{
  "count": 3,
  "totalGnf": 13123000
}
```

- `count` : nombre de paiements non effectués.  
- `totalGnf` : somme des montants (GNF) de ces paiements.

---

## 6. Activités récentes

### `GET /api/v1/employeur/dashboard/recent-activities`

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Query :**

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `limit` | number | 10 | Nombre d’activités (entre 1 et 50). |

Exemple :  
`GET /api/v1/employeur/dashboard/recent-activities?limit=20`

**Réponse 200 :**

```json
{
  "activities": [
    {
      "id": "cot-42",
      "type": "declaration",
      "message": "Déclaration Janvier 2025 validée",
      "time": "Il y a 2h",
      "status": "success"
    },
    {
      "id": "pay-18",
      "type": "payment",
      "message": "Paiement de 9 450 000 GNF effectué",
      "time": "Il y a 5h",
      "status": "success"
    },
    {
      "id": "emp-301",
      "type": "employee",
      "message": "Employé Jean Dupont ajouté",
      "time": "Hier",
      "status": "info"
    }
  ],
  "unreadCount": 2
}
```

| Champ activité | Type | Description |
|----------------|------|-------------|
| `id` | string | Identifiant unique (ex. `cot-42`, `pay-18`, `emp-301`) |
| `type` | string | `declaration` \| `payment` \| `employee` |
| `message` | string | Texte à afficher |
| `time` | string | Ex. « Il y a 2h », « Il y a 30 min », « Hier », ou date formatée fr |
| `status` | string | `success` \| `warning` \| `info` (pour style / icône) |

---

## 7. Recommandation d’usage

- **Page d’accueil (dashboard)** : un seul appel **`GET /api/v1/employeur/dashboard/home`** suffit pour remplir toutes les sections (KPIs, situation employés, activités récentes, résumé du mois).
- Utiliser les routes **`/dashboard/stats`**, **`/dashboard/employee-situation`**, **`/dashboard/pending-payments`**, **`/dashboard/recent-activities`** seulement si vous avez besoin de rafraîchir une section précise sans recharger tout le dashboard.

---

## 8. Erreurs communes

| Code | Cause |
|------|--------|
| **401** | Pas d’en-tête `Authorization`, token invalide ou expiré, ou session Redis expirée (employeur doit se reconnecter). |
| **500** | Erreur interne ; vérifier les logs backend. |

Les réponses d’erreur sont en JSON, avec au moins un champ `message` (ex. `{ "message": "Token manquant" }`).
