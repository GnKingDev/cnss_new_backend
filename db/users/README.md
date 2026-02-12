# Module `db/users/route.js` - Documentation

Ce module gère **l'authentification** (login + OTP), la **gestion des mots de passe**, ainsi que la **gestion des sous-comptes employeur**.

## Configuration requise

### Variables d'environnement

Ajoutez ces variables dans votre fichier `.env` :

```env
# JWT Secret (OBLIGATOIRE)
JWT_SECRET=your-secret-key-change-in-production

# Redis (pour les sessions)
REDIS_HOST=localhost
REDIS_PORT=6379

# OTP Secret
OTP_SECRET=CNSS_SECRET_KEY_FOR_OTP_GENERATION_2024

# Email SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# SMS API (optionnel)
SMS_API_URL=https://api.smspromtngn.com/v1/messages/
SMS_API_KEY=your-sms-api-key

# Paylican API (pour les comptes Payeur)
PAYLICAN_API_URL=https://api.paylican.com
PAYLICAN_CLIENT_ID=your-client-id
PAYLICAN_CLIENT_SECRET=your-client-secret
```

## Installation des dépendances

```bash
npm install jsonwebtoken redis nodemailer otplib axios
```

## Routes disponibles

### Base path
Toutes les routes sont montées sous `/api/v1/user` dans `index.js`.

### 1. Authentification

#### `POST /api/v1/user/login`
Login générique pour tous les utilisateurs.

**Body:**
```json
{
  "user_identify": "IDENTITE_UTILISATEUR",
  "password": "motdepasse"
}
```

**Réponse:**
- 200: `{ "token": "..." }` (token temporaire pour employeur, token final pour autres)
- 400: Message d'erreur

#### `POST /api/v1/user/verify_otp`
Vérifie le code OTP après login (employeur).

**Headers:** `Authorization: Bearer <token_temporaire>`

**Body:**
```json
{
  "code": "123456"
}
```

**Réponse:**
- 200: `{ "token": "..." }` (token final)
- 400: Code OTP incorrect

#### `POST /api/v1/user/verify_imma_send_otp`
Envoie un OTP pour réinitialisation de mot de passe.

**Body:**
```json
{
  "immatriculation": "NO_IMMATRICULATION"
}
```

#### `POST /api/v1/user/verify_otp_reset`
Vérifie un OTP pour réinitialisation.

**Body:**
```json
{
  "code": "123456"
}
```

### 2. Gestion des mots de passe

#### `POST /api/v1/user/resete_password`
Change le mot de passe (employeur connecté).

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "user_password": "ancien",
  "new_password": "nouveau"
}
```

#### `POST /api/v1/user/resete_password_employe`
Change le mot de passe (employé connecté).

**Headers:** `Authorization: Bearer <token>`

#### `POST /api/v1/user/reset_password_forgot`
Réinitialise le mot de passe après OTP.

**Body:**
```json
{
  "imma": "NO_IMMATRICULATION",
  "new_password": "nouveau"
}
```

#### `POST /api/v1/user/modify_password`
Change son propre mot de passe (employeur).

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "password": "ancien",
  "new_password": "nouveau"
}
```

#### `POST /api/v1/user/reset_employe_password_on_mobile/:id`
Reset mot de passe employé depuis mobile.

**Body:**
```json
{
  "new_password": "nouveau"
}
```

### 3. Gestion du profil

#### `POST /api/v1/user/change_email_and_phone_number`
Met à jour email, téléphone et nom.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "email": "nouvel.email@example.com",
  "phone_number": "622000000",
  "full_name": "Nouveau Nom"
}
```

### 4. Gestion des sous-comptes employeurs

#### `POST /api/v1/user/create_user`
Crée un sous-compte (Payeur, Responsable, etc.).

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "full_name": "Nom Prénom",
  "email": "user@example.com",
  "phone_number": "622000000",
  "role": "Payeur"
}
```

#### `GET /api/v1/user/his_list`
Liste tous les sous-comptes de l'employeur.

**Headers:** `Authorization: Bearer <token>`

#### `POST /api/v1/user/delete_user/:id`
Désactive un sous-compte.

**Headers:** `Authorization: Bearer <token>`

#### `POST /api/v1/user/update_user/:id`
Met à jour un sous-compte.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "email": "nouveau@mail.com",
  "phone_number": "622...",
  "type": "Payeur",
  "full_name": "Nouveau Nom"
}
```

#### `POST /api/v1/user/active_user/:id`
Réactive un sous-compte désactivé.

**Headers:** `Authorization: Bearer <token>`

### 5. Déconnexion

#### `POST /api/v1/user/signOut`
Déconnecte l'utilisateur (supprime la session Redis).

**Headers:** `Authorization: Bearer <token>`

#### `GET /api/v1/user/verify_token`
Vérifie la validité du token.

**Headers:** `Authorization: Bearer <token>`

## Middlewares

### `EmployeurToken`
Vérifie le token JWT et la session Redis pour les employeurs.

### `EmployeToken`
Vérifie le token JWT pour les employés (sans Redis).

### `otpVerifyToken`
Vérifie un token temporaire (avant validation OTP).

## Sécurité

- Tous les mots de passe sont hashés avec bcrypt (10 rounds)
- Les tokens JWT expirent après 30 minutes
- Les sessions Redis expirent après 30 minutes
- Les codes OTP sont générés avec TOTP (Time-based One-Time Password)
- Les données sensibles (password, email, phone_number) sont supprimées des réponses

## Notes importantes

1. **Redis est optionnel** : Si Redis n'est pas disponible, les sessions ne seront pas stockées mais l'application fonctionnera toujours.

2. **SMS/Email** : Si les services SMS/Email ne sont pas configurés, les OTP seront loggés dans la console (mode développement).

3. **Paylican** : L'intégration Paylican est optionnelle. Si non configurée, les comptes Payeur seront créés sans synchronisation Paylican.

4. **Production** : Changez absolument `JWT_SECRET` et `OTP_SECRET` en production !
