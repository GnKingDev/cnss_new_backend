# Système de session et tokens

## Expiration glissante

L'utilisateur ne sera **pas déconnecté tant qu'il travaille** :
- Token JWT : 30 min. Si < 5 min restantes lors d'une requête, le backend envoie `X-New-Token` avec un nouveau token.
- Le frontend intercepte `X-New-Token` et met à jour le token stocké.
- Session Redis : TTL 30 min, renouvelée à chaque requête protégée.

---

## Architecture

```
services/session.service.js   → Gestion Redis (sessions, OTP login, blacklist)
db/users/utility.js           → Middlewares auth + délégation au session service
redis.connect.js              → Connexion Redis (partagée)
```

---

## Session Redis

| Clé | TTL | Usage |
|-----|-----|-------|
| `user:<userId>` | 30 min | Session employeur active |
| `otp:login:<userId>` | 5 min | Code OTP envoyé au login (usage unique) |
| `blacklist:<token>` | Jusqu'à exp JWT | Token révoqué (optionnel) |

- **Création** : après `verify_otp` réussi (si `first_login: false`)
- **Renouvellement** : à chaque requête protégée (EmployeurToken, VerifyTokenFlexible)
- **Suppression** : à `signOut` ou expiration TTL

---

## Types de tokens

| Contexte | Clé | Session Redis | Routes accessibles |
|----------|-----|---------------|---------------------|
| Token temporaire (login) | JWT_SECRET | Non | verify_otp, resend_otp |
| Token first_login | JWT_SECRET | Non | verify_token, resete_password_first_login, signOut |
| Token employeur final | EMPLOYEUR_KEY | Oui | Toutes (dashboard, etc.) |

---

## Middlewares

### VerifyTokenFlexible
- **Utilisé par :** `GET /verify_token`, `POST /signOut`
- **Accepte :** token EMPLOYEUR_KEY ou JWT_SECRET (first_login)
- **Vérifie session :** uniquement pour token employeur (pas pour first_login)

### EmployeurToken
- **Utilisé par :** routes protégées dashboard, profil, etc.
- **Accepte :** uniquement token EMPLOYEUR_KEY
- **Vérifie session :** oui (quand Redis activé)

### otpVerifyToken
- **Utilisé par :** verify_otp, resend_otp, resete_password_first_login
- **Accepte :** token JWT_SECRET (temporaire ou first_login)

---

## Flux

1. **Login** → token temporaire (JWT_SECRET)
2. **verify_otp** :
   - `first_login: true` → token limité (JWT_SECRET) → pas de session
   - `first_login: false` → token employeur (EMPLOYEUR_KEY) + session créée
3. **verify_token** : accepte les deux (pour top bar, AuthVerify)  
4. **signOut** : accepte les deux ; supprime la session si employeur
5. **resete_password_first_login** : change MDP, met first_login=false ; supprime session (si existante)

---

## Configuration

- **Redis :** `REDIS_ENABLED=true` dans `.env`
- **Clés JWT :** `JWT_SECRET`, `EMPLOYEUR_KEY` (ou fallback JWT_SECRET)
- **TTL session :** 1800 s (30 min) dans `services/session.service.js`
