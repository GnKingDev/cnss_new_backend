# Module `db/XYemployeurs/route.js` - Documentation

Ce module gère **la soumission de demandes d'immatriculation d'employeurs**, **la validation par DIRGA**, **la gestion des documents**, et **la gestion des demandes** (quitus, etc.).

## Configuration requise

### Variables d'environnement

```env
# JWT Secret
JWT_SECRET=your-secret-key-change-in-production

# Paylican API (optionnel)
PAYLICAN_API_URL=https://api.paylican.com
PAYLICAN_CLIENT_ID=your-client-id
PAYLICAN_CLIENT_SECRET=your-client-secret
```

### Installation des dépendances

```bash
npm install multer
```

## Routes disponibles

### Base path
Toutes les routes sont montées sous `/api/v1/employeur` dans `index.js`.

### 1. Soumission de demandes d'immatriculation

#### `POST /api/v1/employeur/for_verify_data`
Vérifie les données avant soumission.

**Body:**
```json
{
  "requester": {
    "email": "email@example.com",
    "phone_number": "622000000"
  },
  "employeur": {
    "email": "entreprise@example.com",
    "phone_number": "622111111"
  }
}
```

**Réponse:**
- 200: `{ message: 'okoko' }`
- 400: Email existe déjà

#### `POST /api/v1/employeur/for_verify`
Soumet une demande d'immatriculation avec fichiers.

**Content-Type:** `multipart/form-data`

**Fichiers:**
- `cni` - Carte nationale d'identité
- `requester_picture` - Photo du demandeur
- `rccm_file` - Fichier RCCM
- `dni_file` - Fichier DNI
- `logo` - Logo de l'entreprise
- `DPAE_file` - Fichier DPAE

**Body (form-data):**
- `employeur`: JSON stringifié
- `requester`: JSON stringifié

**Réponse:**
- 200: Objet employeur créé
- 400: Erreur

### 2. Validation et immatriculation (DIRGA)

#### `GET /api/v1/employeur/all_employeur`
Liste tous les employeurs en attente de validation.

**Headers:** `Authorization: Bearer <token>` (DIRGA)

**Query params:**
- `page` (défaut: 1)
- `limit` (défaut: 20, max: 100)

**Réponse:**
```json
{
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 100,
    "itemsPerPage": 20,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

#### `POST /api/v1/employeur/validate/:id`
Valide et immatricule un employeur (traitement asynchrone).

**Headers:** `Authorization: Bearer <token>` (DIRGA)

**Réponse:**
- 200: `{ message: 'Employeur immatriculé' }`

#### `GET /api/v1/employeur/get_all_emplyeur`
Liste tous les employeurs avec leurs employés.

**Headers:** `Authorization: Bearer <token>` (DIRGA)

**Query params:**
- `page` (défaut: 1)
- `limit` (défaut: 20, max: 100)

**Réponse:** Format paginé avec employeurs et leurs employés

### 3. Gestion des documents

#### `GET /api/v1/employeur/document`
Récupère tous les documents de l'employeur connecté.

**Headers:** `Authorization: Bearer <token>` (Employeur)

**Query params:**
- `page` (défaut: 1)
- `limit` (défaut: 20, max: 100)

**Réponse:** Format paginé avec documents

### 4. Informations de l'employeur connecté

#### `GET /api/v1/employeur/one`
Récupère les informations complètes de l'employeur connecté.

**Headers:** `Authorization: Bearer <token>` (Employeur)

**Réponse:**
```json
{
  "employeur": {...},
  "user": {...}
}
```

### 5. Gestion des demandes

#### `GET /api/v1/employeur/get_all_demandes`
Liste toutes les demandes de l'employeur connecté.

**Headers:** `Authorization: Bearer <token>` (Employeur)

**Query params:**
- `page` (défaut: 1)
- `limit` (défaut: 20, max: 100)

**Réponse:** Format paginé avec demandes

#### `POST /api/v1/employeur/create_demande`
Crée une nouvelle demande (quitus, etc.).

**Headers:** `Authorization: Bearer <token>` (Employeur)

**Body:**
```json
{
  "motif": "Demande de quitus"
}
```

**Réponse:**
- 200: `{ message: 'demande ajoutés' }`

#### `GET /api/v1/employeur/get_all_demandes_dirga`
Liste toutes les demandes de tous les employeurs (DIRGA).

**Headers:** `Authorization: Bearer <token>` (DIRGA)

**Query params:**
- `page` (défaut: 1)
- `limit` (défaut: 20, max: 100)
- `status` (optionnel) - Filtrer par statut

**Réponse:** Format paginé avec demandes

### 6. Gestion administrative (DIRGA)

#### `POST /api/v1/employeur/update_employeur/:id`
Met à jour les informations d'un employeur.

**Headers:** `Authorization: Bearer <token>` (DIRGA)

**Body:**
```json
{
  "email": "nouveau@email.com",
  "phone_number": "622000000",
  "raison_sociale": "Nouvelle Raison Sociale",
  "prefecture_id": 1,
  "branche_id": 2
}
```

#### `POST /api/v1/employeur/delete_employeur/:id`
Supprime définitivement un employeur.

**Headers:** `Authorization: Bearer <token>` (DIRGA)

**Réponse:**
- 200: `{ message: 'operation ok' }`

## Middlewares

### `verifyToken`
Vérifie le token JWT pour les utilisateurs DIRGA/administration.

### `EmployeurToken`
Vérifie le token JWT et la session Redis pour les employeurs (depuis `db/users/utility.js`).

## Pagination

Toutes les routes qui retournent des listes utilisent la pagination avec les paramètres suivants :

- **page**: Numéro de page (défaut: 1)
- **limit**: Nombre d'éléments par page (défaut: 20, max: 100)

**Format de réponse paginée:**
```json
{
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 100,
    "itemsPerPage": 20,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

## Upload de fichiers

Les fichiers sont uploadés dans le dossier `uploads/` à la racine du projet. Les noms de fichiers sont générés automatiquement avec un suffixe unique pour éviter les collisions.

## Notes importantes

1. **Traitement asynchrone**: La route `validate/:id` retourne immédiatement, mais le traitement réel (génération d'immatriculation, création de compte, etc.) devrait se faire en arrière-plan via une queue (à implémenter).

2. **Bug corrigé**: Dans `update_employeur/:id`, la comparaison `if(upadte.type="admin")` a été corrigée en `if(user.type === 'admin')`.

3. **Sécurité**: Tous les fichiers uploadés sont stockés localement. En production, considérez l'utilisation d'un service de stockage cloud (S3, etc.).

4. **Validation**: Les fonctions `valideEmailFunction` et `ValidatePhoneNumber` sont disponibles mais actuellement commentées dans `for_verify_data` (comme dans l'original).
