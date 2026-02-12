# API User – Routes pour le frontend

**Base URL :** `/api/v1/user` (ou `/api/users` en compatibilité)

**Authentification :** En-tête `Authorization: Bearer <token>` pour les routes protégées.

---

## Model User

Table `users`. Champs renvoyés par l’API (objet utilisateur **sanitized** : sans `password`, `email`, `phone_number`, `otp_secret` sauf mention contraire).

| Champ | Type | Description |
|-------|------|-------------|
| `id` | number | Identifiant interne (PK) |
| `user_identify` | string | Immatriculation du compte principal (employeur) ; commun à tous les sous-comptes |
| `identity` | string | Identifiant de connexion (immatriculation ou sous-compte, ex. P1, R1) — unique |
| `role` | string | Rôle : `employeur`, `employe`, `admin`, etc. |
| `type` | string | Sous-type employeur : `Payeur`, `Rédacteur`, etc. (défaut `admin`) |
| `full_name` | string | Nom complet |
| `email` | string | Email (non renvoyé dans les réponses sanitized) |
| `phone_number` | string | Téléphone (non renvoyé dans les réponses sanitized) |
| `user_id` | number | ID de l’employeur (table employeurs) ou de l’employé selon le rôle |
| `first_login` | boolean | Premier login (mot de passe à changer) |
| `can_work` | boolean | Compte actif (`false` = désactivé) |
| `last_connect_time` | string (ISO date) | Dernière connexion |
| `createdAt` | string (ISO date) | Date de création |
| `updatedAt` | string (ISO date) | Dernière mise à jour |

**Champs jamais renvoyés par l’API :** `password`, `otp_secret`. `email` et `phone_number` sont exclus des réponses « user » sanitized pour la sécurité.

**JWT (payload décodé) :** `id`, `identity`, `role`, `user_identify`, `user_id` (+ `exp`, `iat`).

---

## 1. Login

### POST `/api/v1/user/login`

Connexion avec identifiant (immatriculation) et mot de passe.

- **Corps (JSON) :**
  - `user_identify` (string) — immatriculation / identifiant
  - `password` (string) — mot de passe

- **Comportement :**
  - **Employeur :** après vérification du mot de passe, un OTP est envoyé par email et/ou SMS. La réponse contient un **token temporaire** (30 min) à utiliser pour appeler `verify_otp` avec le code reçu.
  - **Autres rôles (employé, etc.) :** la réponse contient directement le **token final** (30 min). Pas d’étape OTP.

- **Réponse 200 :**
  - `token` (string) — JWT (temporaire pour employeur, final pour les autres)
  - `email` (string | null) — email du compte
  - `phone_number` (string | null) — numéro de téléphone du compte

- **Erreurs :**
  - 400 — identifiant/mot de passe manquant ou incorrect, ou compte désactivé (`can_work: false`).
  - 500 — erreur serveur.

---

## 2. OTP (employeur)

### POST `/api/v1/user/verify_otp`

Vérification du code OTP après login employeur. **Requiert le token temporaire** reçu dans la réponse du login.

- **En-tête :** `Authorization: Bearer <token_temporaire>`

- **Corps (JSON) :**
  - `code` (string) — code OTP reçu par email/SMS

- **Réponse 200 :**
  - `token` (string) — JWT final (30 min), à utiliser pour les appels protégés employeur.
  - `first_login` (boolean) — `true` si premier login (mot de passe à changer) ; le front peut rediriger vers l’écran de changement de mot de passe.

- **Erreurs :**
  - 400 — code OTP manquant ou incorrect.
  - 401 — token manquant ou invalide.
  - 404 — utilisateur non trouvé.
  - 500 — erreur serveur.

---

### POST `/api/v1/user/resend_otp`

Renvoyer un nouveau code OTP à l’utilisateur identifié par le **token temporaire** (même JWT que pour `verify_otp`). À utiliser après le login employeur si l’utilisateur n’a pas reçu le code ou si celui-ci a expiré.

- **En-tête :** `Authorization: Bearer <token_temporaire>`

- **Corps :** aucun (ou `{}`)

- **Réponse 200 :**
  - `message` (string) — `"Code renvoyé"`

- **Erreurs :**
  - 401 — token manquant ou invalide.
  - 404 — utilisateur non trouvé.
  - 500 — erreur serveur.

---

### POST `/api/v1/user/verify_imma_send_otp`

Envoi d’un OTP à partir de l’immatriculation uniquement (sans mot de passe). Utilisable pour « Mot de passe oublié » ou récupération de compte : l’utilisateur saisit son immatriculation, reçoit un OTP, puis le front enchaîne avec `verify_otp_reset` puis `reset_password_forgot`.

- **Corps (JSON) :**
  - `immatriculation` (string) — numéro d’immatriculation

- **Réponse 200 :**
  - `user` (object) — infos utilisateur sans données sensibles (pas de mot de passe, otp_secret, etc.).
  - `email` (string | null) — email du compte.
  - `phone_number` (string | null) — numéro de téléphone du compte.
  - `token` (string) — JWT court (10 min) à envoyer à `verify_otp_reset` pour identifier l’utilisateur (en-tête `Authorization: Bearer <token>`).

- **Erreurs :**
  - 400 — immatriculation manquante, utilisateur/employeur/employé non trouvé, ou pas de numéro pour l’employé.
  - 500 — erreur serveur.

---

### POST `/api/v1/user/verify_otp_reset`

Vérification du code OTP dans le cadre « Mot de passe oublié ». **Requiert le token** renvoyé par `verify_imma_send_otp` (middleware `otpVerifyToken`). À appeler après `verify_imma_send_otp` et avant `reset_password_forgot`.

- **En-tête :** `Authorization: Bearer <token>` (token reçu dans la réponse de `verify_imma_send_otp`)

- **Corps (JSON) :**
  - `code` (string) — code OTP reçu

- **Réponse 200 :**
  - `message: "ok"` — OTP valide, le front peut afficher le formulaire de nouveau mot de passe et appeler `reset_password_forgot`.

- **Erreurs :**
  - 400 — code OTP manquant ou incorrect/expiré.
  - 401 — token manquant ou invalide.
  - 404 — utilisateur non trouvé.
  - 500 — erreur serveur.

---

## 3. Changement de mot de passe (utilisateur connecté)

### POST `/api/v1/user/resete_password` — Employeur

Change le mot de passe de l’employeur connecté (ancien + nouveau mot de passe).

- **En-tête :** `Authorization: Bearer <token_employeur>`

- **Corps (JSON) :**
  - `user_password` (string) — mot de passe actuel
  - `new_password` (string) — nouveau mot de passe

- **Réponse 200 :**
  - `message: "Mot de passe modifié avec succès"` — la session est supprimée côté serveur ; le front doit rediriger vers l’écran de login.

- **Erreurs :**
  - 400 — champs manquants ou ancien mot de passe incorrect.
  - 401 — token manquant ou invalide.
  - 404 — utilisateur non trouvé.
  - 500 — erreur serveur.

---

### POST `/api/v1/user/resete_password_employe` — Employé

Même logique que `resete_password` mais pour un employé connecté.

- **En-tête :** `Authorization: Bearer <token_employe>`

- **Corps (JSON) :**
  - `user_password` (string) — mot de passe actuel
  - `new_password` (string) — nouveau mot de passe

- **Réponse 200 :**
  - `message: "Mot de passe modifié avec succès"`

- **Erreurs :** mêmes principes que `resete_password` (400, 401, 404, 500).

---

### POST `/api/v1/user/modify_password` — Employeur (alias)

Autre route de changement de mot de passe pour l’employeur, noms de champs différents.

- **En-tête :** `Authorization: Bearer <token_employeur>`

- **Corps (JSON) :**
  - `password` (string) — mot de passe actuel
  - `new_password` (string) — nouveau mot de passe

- **Réponse 200 :**
  - `message: "Mot de passe modifié avec succès"`

- **Erreurs :** 400, 401, 404, 500 (même logique que ci-dessus).

---

## 4. Mot de passe oublié (sans être connecté)

Flux recommandé côté front :

1. **Saisie immatriculation** → **POST** `verify_imma_send_otp` avec `{ "immatriculation": "..." }`.
2. **Saisie code OTP** → **POST** `verify_otp_reset` avec en-tête `Authorization: Bearer <token>` (token reçu à l’étape 1) et body `{ "code": "..." }`.
3. **Saisie nouveau mot de passe** → **POST** `reset_password_forgot` avec `{ "imma": "...", "new_password": "..." }`.

### POST `/api/v1/user/reset_password_forgot`

Définit le nouveau mot de passe après validation OTP (via `verify_otp_reset`). **Aucun token requis.**

- **Corps (JSON) :**
  - `imma` (string) — immatriculation du compte
  - `new_password` (string) — nouveau mot de passe

- **Réponse 200 :**
  - `role` (string) — rôle de l’utilisateur (ex. `"employeur"`, `"employe"`).
  - `message: "Mot de passe réinitialisé avec succès"`

- **Erreurs :**
  - 400 — immatriculation ou nouveau mot de passe manquant.
  - 404 — utilisateur non trouvé.
  - 500 — erreur serveur.

---

## 5. Autres routes utiles

| Méthode | Route | Description | Auth |
|--------|--------|-------------|------|
| **POST** | `/api/v1/user/signOut` | Déconnexion employeur (suppression session Redis) | Token employeur |
| **GET**  | `/api/v1/user/verify_token` | Vérifie que le token est valide et renvoie l’utilisateur | Token employeur |
| **POST** | `/api/v1/user/change_email_and_phone_number` | Met à jour email, téléphone, nom de l’employeur | Token employeur |
| **POST** | `/api/v1/user/create_user` | Création d’un sous-compte employeur (Payeur / Rédacteur, etc.) | Token employeur |
| **GET**  | `/api/v1/user/his_list` | Liste paginée des sous-comptes de l’employeur | Token employeur |
| **POST** | `/api/v1/user/update_user/:id` | Mise à jour d’un sous-compte | Token employeur |
| **POST** | `/api/v1/user/delete_user/:id` | Désactivation d’un sous-compte | Token employeur |
| **POST** | `/api/v1/user/active_user/:id` | Réactivation d’un sous-compte | Token employeur |
| **POST** | `/api/v1/user/reset_employe_password_on_mobile/:id` | Réinitialisation mot de passe employé par immatriculation (sans auth) | Aucune |

---

## Récap flux principaux

- **Login employeur :** `login` → recevoir OTP → `verify_otp` avec le token temporaire → utiliser le token final pour les appels protégés.
- **Login employé (ou autre rôle) :** `login` → token final directement.
- **Changer le mot de passe (connecté) :** employeur → `resete_password` ou `modify_password` ; employé → `resete_password_employe`.
- **Mot de passe oublié :** `verify_imma_send_otp` → `verify_otp_reset` → `reset_password_forgot`.

Toutes les réponses d’erreur métier sont au format JSON avec un champ `message` (ex. `{ "message": "Mot de passe ou identification incorrecte" }`).
