# Parcours de connexion – Utilisateur unique

Ce document décrit en détail le **parcours de login** d’un utilisateur unique (employeur ou employé) : comment les **données** sont envoyées et reçues, et comment les **tokens** sont émis et utilisés.

**Base URL API :** `/api/v1/user`

---

## 1. Comment l’utilisateur envoie et reçoit les données

### 1.1 Format des échanges

- **Requêtes :** JSON dans le corps (body) pour les `POST`. Les paramètres de pagination (liste) passent en **query** (`?page=1&limit=10`).
- **Réponses :** Toujours du JSON. En cas d’erreur métier, un objet avec au moins un champ `message` (ex. `{ "message": "Mot de passe ou identification incorrecte" }`).

### 1.2 Données envoyées par le client (login)

| Étape | Méthode | Route | Corps (body) envoyé |
|--------|--------|--------|----------------------|
| Connexion | `POST` | `/api/v1/user/login` | `{ "user_identify": "<identifiant>", "password": "<mot de passe>" }` |
| Vérification OTP (employeur) | `POST` | `/api/v1/user/verify_otp` | `{ "code": "<code OTP à 6 chiffres>" }` |
| Renvoyer OTP | `POST` | `/api/v1/user/resend_otp` | (vide ou `{}`) |
| Mot de passe oublié – envoi OTP | `POST` | `/api/v1/user/verify_imma_send_otp` | `{ "immatriculation": "<immatriculation>" }` |
| Mot de passe oublié – vérif OTP | `POST` | `/api/v1/user/verify_otp_reset` | `{ "code": "<code OTP>" }` |
| Mot de passe oublié – nouveau MDP | `POST` | `/api/v1/user/reset_password_forgot` | `{ "imma": "<immatriculation>", "new_password": "<nouveau MDP>" }` |
| Changement MDP (connecté employeur) | `POST` | `/api/v1/user/resete_password` | `{ "user_password": "<ancien>", "new_password": "<nouveau>" }` |
| Changement MDP (connecté employé) | `POST` | `/api/v1/user/resete_password_employe` | `{ "user_password": "<ancien>", "new_password": "<nouveau>" }` |

- **`user_identify`** au login = identifiant de connexion (immatriculation employeur ou identité du sous-compte, ex. `P1`, `R1`). C’est le champ `identity` en base.
- Toutes les routes protégées nécessitent l’en-tête **`Authorization: Bearer <token>`** (voir section 2).

### 1.3 Données renvoyées par le serveur (réponses 200)

- **Login (tous rôles)**  
  - `token` (string) – JWT  
  - `email` (string | null)  
  - `phone_number` (string | null)  

- **Login employeur** : le premier `token` est **temporaire** (30 min), à utiliser uniquement pour `verify_otp` et `resend_otp`. Il ne donne **pas** accès aux routes protégées employeur (dashboard, etc.).

- **Verify OTP (employeur)**  
  - Si **première connexion** (`first_login: true`) :  
    - `token` (string) – JWT limité (signé avec `JWT_SECRET`, pas `EMPLOYEUR_KEY`)  
    - `first_login: true`  
    - `message: "Première connexion. Veuillez changer votre mot de passe."`  
  - Sinon :  
    - `token` (string) – JWT final employeur (signé avec `EMPLOYEUR_KEY`)  
    - `first_login: false`  

- **Verify imma send OTP (mot de passe oublié)**  
  - `user` (object) – utilisateur sanitized (sans `password`, `otp_secret`, etc.)  
  - `email`, `phone_number` (string | null)  
  - `token` (string) – JWT court 10 min pour appeler `verify_otp_reset`  

- **Verify OTP reset**  
  - `message: "ok"`  

- **Reset password forgot**  
  - `role` (string)  
  - `message: "Mot de passe réinitialisé avec succès"`  

- **Changement de mot de passe (connecté)**  
  - `message: "Mot de passe modifié avec succès"` (et pour employeur, la session Redis est supprimée : il faut se reconnecter).  

- **Verify token**  
  - `message: "Token valide"`  
  - `user` (object) – utilisateur sanitized (issu du payload JWT).  

Les réponses « user » sont **sanitized** : pas de `password`, `email`, `phone_number`, `otp_secret` dans l’objet utilisateur (sauf quand ces champs sont renvoyés explicitement à part, ex. `email` / `phone_number` au login).

---

## 2. Comment l’utilisateur reçoit et utilise les tokens

### 2.1 Où le token est reçu (côté client)

Le token est **toujours renvoyé dans le corps JSON** de la réponse HTTP :

- **Login** : `response.token`
- **Verify OTP** : `response.token`
- **Verify imma send OTP** : `response.token`

Le client doit **stocker** ce token (ex. mémoire, sessionStorage, cookie sécurisé) et le renvoyer à chaque requête protégée.

### 2.2 Comment le token est renvoyé au serveur

Pour **toutes les routes protégées**, le client envoie le token dans l’en-tête HTTP :

```http
Authorization: Bearer <token>
```

- Pas de token dans le body pour l’auth.
- Le middleware lit : `req.get('Authorization')` puis enlève le préfixe `"Bearer "` pour obtenir le JWT.

### 2.3 Types de tokens et durée de vie

| Contexte | Clé de signature | Durée | Usage |
|----------|------------------|--------|--------|
| Login employeur (après mot de passe) | `JWT_SECRET` | 30 min | Temporaire : uniquement `verify_otp`, `resend_otp`. **Pas** d’accès aux routes EmployeurToken. |
| Verify OTP – première connexion | `JWT_SECRET` | 30 min | Token limité (payload avec `first_login: true`). Conçu pour rediriger vers l’écran de changement de mot de passe. **Ne passe pas** le middleware `EmployeurToken` (qui utilise `EMPLOYEUR_KEY`). |
| Verify OTP – connexion normale | `EMPLOYEUR_KEY` | 30 min | Token final employeur. Utiliser pour toutes les routes protégées employeur (`EmployeurToken`). |
| Login employé / autre rôle | `JWT_SECRET` | 30 min | Token final pour ce rôle (pas d’OTP). |
| Mot de passe oublié (verify_imma_send_otp) | `JWT_SECRET` | 10 min | À envoyer à `verify_otp_reset` uniquement. |

En résumé : l’utilisateur **reçoit** le token dans le **body** des réponses de login/verify_otp/verify_imma_send_otp, puis **retourne** ce token dans l’en-tête **`Authorization: Bearer <token>`** pour les appels suivants.

### 2.4 Vérification côté serveur (middlewares)

- **EmployeurToken** (`db/users/utility.js`)  
  - Récupère le token via `Authorization: Bearer <token>`.  
  - Vérifie avec **`EMPLOYEUR_KEY`** (ou fallback `JWT_SECRET`).  
  - Vérifie la session Redis (`user:<userId>`), si Redis est connecté.  
  - Vérifie que l’utilisateur existe et `can_work === true`.  
  - Met à jour `last_connect_time` et renouvelle la session Redis.  
  - En cas d’échec : 401 (token manquant, invalide, session expirée ou utilisateur non autorisé).  

- **otpVerifyToken**  
  - Même en-tête `Authorization: Bearer <token>`.  
  - Vérifie avec **`JWT_SECRET`**.  
  - Utilisé pour `verify_otp`, `resend_otp`, `verify_otp_reset` (token temporaire ou token « mot de passe oublié »).  

- **EmployeToken**  
  - Vérifie avec **`EMPLOYE_KEY`** (tokens employé).  

Donc : **réception des tokens** = dans les réponses JSON ; **utilisation des tokens** = en-tête `Authorization: Bearer <token>` ; **type de token** = selon la clé (JWT_SECRET vs EMPLOYEUR_KEY) et le payload (`first_login`, rôle, etc.).

### 2.5 Session Redis (employeur)

- À l’issue d’un **login réussi** (hors OTP) ou d’un **verify_otp réussi** (connexion normale, pas first_login), le serveur enregistre une session : `user:<userId>` en Redis avec TTL 30 min.
- À chaque requête protégée par **EmployeurToken**, la session est vérifiée et son TTL renouvelé (30 min).
- **signOut** supprime la clé Redis ; le token JWT reste valide jusqu’à expiration mais sera refusé car la session n’existe plus.

---

## 3. Parcours login résumé (schéma)

### 3.1 Employeur

1. **POST** `/api/v1/user/login`  
   - Body : `user_identify`, `password`.  
   - Réponse : `token` (temporaire), `email`, `phone_number`.  
   - OTP envoyé par email/SMS (et stocké 5 min en Redis pour acceptation dans verify_otp).  

2. **POST** `/api/v1/user/verify_otp`  
   - Header : `Authorization: Bearer <token_temporaire>`.  
   - Body : `code` (OTP).  
   - Réponse :  
     - Si **first_login** : `token` (limité), `first_login: true`, message « Première connexion… ».  
     - Sinon : `token` (final employeur), `first_login: false`. Session Redis créée.  

3. Si **first_login** : afficher l’écran de changement de mot de passe. Le token limité (JWT_SECRET) ne permet **pas** d’appeler les routes protégées par `EmployeurToken` ; il faudrait une route dédiée « changement mot de passe première connexion » acceptant ce token, ou un flux équivalent.  

4. Sinon : utiliser le **token final** pour tous les appels (dashboard, profil, etc.) avec `Authorization: Bearer <token>`.  

### 3.2 Employé (ou autre rôle non employeur)

1. **POST** `/api/v1/user/login`  
   - Body : `user_identify`, `password`.  
   - Réponse : `token` (final), `email`, `phone_number`. Pas d’OTP.  
   - Session Redis créée si applicable.  

2. Utiliser ce token dans **`Authorization: Bearer <token>`** pour les routes protégées employé.  

### 3.3 Mot de passe oublié

1. **POST** `/api/v1/user/verify_imma_send_otp` avec `immatriculation` → réception de `token` (10 min) + email/phone.  
2. **POST** `/api/v1/user/verify_otp_reset` avec header `Authorization: Bearer <token>` et body `code` → réponse `message: "ok"`.  
3. **POST** `/api/v1/user/reset_password_forgot` avec `imma` et `new_password` (pas de token).  

---

## 4. Récap – Données et tokens

| Question | Réponse |
|----------|--------|
| Comment l’utilisateur **envoie** les données ? | En JSON dans le **body** des `POST` ; identifiant/mot de passe au login, code OTP dans verify_otp, etc. |
| Comment le serveur **retourne** les données ? | En JSON : `token`, `email`, `phone_number`, `user`, `message`, `first_login`, etc. |
| Comment l’utilisateur **reçoit** les tokens ? | Dans le **corps de la réponse** : champ `token` des réponses de login, verify_otp, verify_imma_send_otp. |
| Comment l’utilisateur **renvoie** le token ? | Dans l’en-tête **`Authorization: Bearer <token>`** pour chaque requête vers une route protégée. |
| Différence token temporaire / final ? | Temporaire (login employeur) : JWT_SECRET, 30 min, uniquement verify_otp / resend_otp. Final employeur : EMPLOYEUR_KEY, 30 min, accès à toutes les routes employeur. |

Ce fichier peut être complété par les détails des routes dans `docs/API_USER_ROUTES.md`.
