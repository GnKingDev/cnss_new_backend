# Top Bar du Dashboard – Données Backend pour le frontend

Ce document décrit **les données et appels backend** nécessaires pour alimenter la **barre supérieure (Header)** du dashboard employeur.

**Authentification :** toutes les routes ci-dessous utilisent le **token employeur** :  
`Authorization: Bearer <token>`

---

## Demande au backend : données pour le Top Bar uniquement

Le frontend a besoin des **données entreprise** pour afficher le **top bar** (raison sociale et numéro d’immatriculation).  
**Aucune donnée de la page d’accueil (home) n’est retournée par cette route.**

### Route fournie par le backend

**`GET /api/v1/employeur/profile`**

- **Authentification :** obligatoire.  
  En-tête : `Authorization: Bearer <token_employeur>`  
  (token reçu après login + verify_otp).
- **Query :** aucun.
- **Réponse :** JSON avec **uniquement** les champs nécessaires au top bar (données entreprise).

### Structure de réponse (200)

```json
{
  "companyName": "CAISSE NATIONALE DE SECURITE SOCIALE",
  "registrationNumber": "8204000010400"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `companyName` | string | Raison sociale (affichée dans le bloc entreprise du top bar). |
| `registrationNumber` | string | Numéro d’immatriculation employeur (affiché avec le libellé « N° »). |

### Erreurs

- **401** — Token manquant, invalide ou expiré. Ex. `{ "message": "Token manquant" }`.
- **404** — Employeur non trouvé. Ex. `{ "message": "Employeur non trouvé" }`.
- **500** — Erreur serveur.

### Récap

- **URL :** `GET /api/v1/employeur/profile`
- **Header :** `Authorization: Bearer <token_employeur>`
- **Réponse :** `companyName`, `registrationNumber`, `userFullName`, `userRole` pour le top bar.  
  **Aucune donnée dashboard / home** dans cette route.

---

## 1. Contenu du Top Bar et source des données

| Zone | Affichage | Source backend |
|------|-----------|-----------------|
| **Gauche** | Message de bienvenue + « Dashboard » | Texte statique / i18n (aucun appel) |
| **Centre-droit** | **Infos entreprise** : nom (raison sociale) + N° d’immatriculation | `GET /api/v1/employeur/profile` ou `employeur` dans `GET /api/v1/employeur/dashboard/home` |
| **Droite** | **Utilisateur connecté** : avatar (initiales), nom, rôle | Objet **user** de `GET /api/v1/user/verify_token` |
| **Bouton** | Déconnexion | `POST /api/v1/user/signOut` |

---

## 2. Utilisateur connecté (nom, rôle, initiales)

**Route :** `GET /api/v1/user/verify_token`

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Réponse 200 :**

```json
{
  "message": "Token valide",
  "user": {
    "id": 1,
    "identity": "8204000010400",
    "role": "employeur",
    "user_identify": "8204000010400",
    "user_id": 42,
    "full_name": "Albert Balamou",
    "type": "Payeur",
    "can_work": true,
    "first_login": false,
    "last_connect_time": "2025-01-29T10:00:00.000Z",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Champs utilisés pour le Top Bar :**

| Champ | Usage |
|-------|--------|
| `user.full_name` | Nom affiché à droite ; initiales pour l’avatar (ex. « Albert Balamou » → « AB »). |
| `user.role` | Libellé sous le nom (ex. « Employeur »). Le front peut mapper vers une clé i18n. |
| `user.type` | Sous-type (ex. « Payeur », « Rédacteur ») si vous l’affichez. |

Le front peut appeler `verify_token` au chargement du layout (ou après connexion), stocker `user` dans le contexte d’auth et l’utiliser dans le top bar sans appel supplémentaire pour le nom / rôle.

---

## 3. Infos entreprise (raison sociale, N° immatriculation)

Deux possibilités.

### Option A – Endpoint dédié (si le top bar se charge sans appeler le dashboard)

**Route :** `GET /api/v1/employeur/profile`

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Réponse 200 :**

```json
{
  "companyName": "CNSS GUINÉE",
  "registrationNumber": "8204000010400"
}
```

| Champ | Type | Usage |
|-------|------|--------|
| `companyName` | string | Raison sociale (bloc entreprise, centre-droit). |
| `registrationNumber` | string | N° d’immatriculation (ex. avec libellé « N° »). |

Appel recommandé **une fois** au chargement du layout dashboard, puis stockage en state/context.

### Option B – Inclus dans le dashboard (recommandé si la page d’accueil charge le dashboard)

Si le front appelle **`GET /api/v1/employeur/dashboard/home`** pour la page d’accueil, la réponse contient déjà un bloc **`employeur`** :

```json
{
  "employeur": {
    "companyName": "CNSS GUINÉE",
    "registrationNumber": "8204000010400"
  },
  "employees": { ... },
  ...
}
```

Le front peut utiliser `response.employeur.companyName` et `response.employeur.registrationNumber` pour le top bar (et les stocker en state/context après le premier chargement).

---

## 4. Déconnexion

**Route :** `POST /api/v1/user/signOut`

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Body :** vide ou `{}`.

**Réponse 200 :**

```json
{
  "message": "Déconnexion réussie"
}
```

**Comportement backend :** le serveur supprime la session Redis (`user:<userId>`). Le token ne sera plus accepté sur les routes protégées employeur.

**Comportement frontend recommandé :**

1. Appeler `POST /api/v1/user/signOut` (ou ignorer l’erreur réseau / 401).
2. Supprimer le token (localStorage / contexte).
3. Supprimer l’objet user du contexte.
4. Rediriger vers la page de **login** (ex. `/login`).

En cas d’échec (401, réseau), le front peut quand même nettoyer le token et rediriger.

---

## 5. Récap – Qui fournit quoi

| Donnée / action Top Bar | Fournisseur |
|------------------------|-------------|
| Nom utilisateur, rôle, initiales | Objet **user** de `GET /api/v1/user/verify_token` (`full_name`, `role`). |
| Raison sociale, N° immatriculation | `GET /api/v1/employeur/profile` **ou** bloc `employeur` dans `GET /api/v1/employeur/dashboard/home`. |
| Déconnexion | `POST /api/v1/user/signOut` + nettoyage local + redirection `/login`. |

---

## 6. Erreurs

- **401** sur `verify_token` ou `profile` : token manquant, invalide ou session expirée → redirection vers login, message utilisateur.
- **404** sur `profile` : employeur non trouvé (cas rare) → afficher un libellé par défaut (ex. « — ») ou masquer le bloc entreprise.
- Champs entreprise absents : afficher « — » ou masquer le bloc jusqu’à réception des données.

Voir aussi : **`docs/API_DASHBOARD_ROUTES_FRONTEND.md`** (routes dashboard et bloc `employeur` dans `/dashboard/home`), **`docs/API_USER_ROUTES.md`** (login, verify_otp, verify_token, signOut).
