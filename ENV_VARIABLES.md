# Variables d'environnement (.env) – Backend CNSS

Liste de toutes les variables utilisées dans le projet. Copier dans un fichier `.env` à la racine et renseigner les valeurs.

---

## Application

| Variable   | Défaut        | Fichier  | Usage                    |
|-----------|---------------|----------|---------------------------|
| `PORT`    | 3000          | index.js | Port du serveur Express   |
| `NODE_ENV`| development   | db/db.connection.js, db/prefecture/route.js, db/XYemployeurs/route.js | Environnement (development/production) |

---

## Base de données MySQL (Sequelize)

| Variable     | Défaut   | Fichier              | Usage          |
|-------------|----------|----------------------|----------------|
| `DB_NAME`   | cnss_db  | db/db.connection.js  | Nom de la BDD  |
| `DB_USER`   | root     | db/db.connection.js  | Utilisateur    |
| `DB_PASSWORD` | (vide) | db/db.connection.js  | Mot de passe   |
| `DB_HOST`   | localhost| db/db.connection.js  | Hôte MySQL    |
| `DB_PORT`   | 3306     | db/db.connection.js  | Port MySQL    |

---

## Redis

| Variable      | Défaut   | Fichier        | Usage (sessions, cache, file Bull) |
|---------------|----------|----------------|------------------------------------|
| `redis_host` | localhost| redis.connect.js | Hôte Redis (ou `REDIS_HOST`)   |
| `redis_port` | 6379     | redis.connect.js | Port Redis (ou `REDIS_PORT`)   |
| `REDIS_HOST` | localhost| redis.connect.js | Variante possible              |
| `REDIS_PORT` | 6379     | redis.connect.js | Variante possible              |

---

## JWT / Authentification

| Variable    | Défaut / fallback     | Fichier                          | Usage                    |
|-------------|------------------------|----------------------------------|---------------------------|
| `JWT_SECRET` | your-secret-key       | db/users/utility.js, db/users/route.js, db/prefecture/utility.js, db/dirga_user/route.js, db/XYemployeurs/utility.js | Secret pour signer les JWT |
| `key`       | (optionnel)            | db/dirga_user/route.js          | Fallback JWT pour dirga   |

---

## Ancienne base / API externe

| Variable        | Défaut              | Fichier                         | Usage                    |
|-----------------|---------------------|---------------------------------|---------------------------|
| `OLD_DB_API_URL`| http://192.168.56.128 | utility.js, old.db.js, db/dirga_user/route.js, db/employe/route.js | URL de l’API ancienne BDD |

---

## SMTP (emails)

| Variable   | Défaut           | Fichier              | Usage              |
|------------|------------------|----------------------|--------------------|
| `SMTP_HOST`| smtp.gmail.com    | db/users/utility2.js | Serveur SMTP       |
| `SMTP_PORT`| 587              | db/users/utility2.js | Port SMTP          |
| `SMTP_USER`| noreply@cnss.gov.gn | db/users/utility2.js, utility2.js | Compte email expéditeur |
| `SMTP_PASS`| -                | db/users/utility2.js | Mot de passe SMTP  |

---

## SMS

| Variable           | Fichier           | Usage                              |
|--------------------|--------------------|------------------------------------|
| `smskey`           | config.queue.js    | Clé API smspromtngn (envoi SMS file Bull) |
| `SMS_API_URL`       | db/users/utility2.js | URL API SMS (OTP)                |
| `SMS_API_KEY`       | db/users/utility2.js | Clé API SMS (OTP)                |
| `ORANGE_SMS_API_URL`| db/users/utility2.js | URL API Orange SMS (OTP)         |
| `ORANGE_SMS_API_KEY`| db/users/utility2.js | Clé API Orange SMS (OTP)         |
| `SMS_SENDER`        | db/users/utility2.js | Expéditeur (défaut: CNSS)        |

---

## Paylican – Paiement

| Variable                        | Fichier               | Usage                    |
|---------------------------------|------------------------|---------------------------|
| `PAYLICAN_TOKEN_URL`            | db/paiement/utility.js| URL token Paylican       |
| `PAYLICAN_PAYEMENT_TOKEN_USERNAME` | db/paiement/utility.js | Identifiant token     |
| `PAYLICAN_PAYEMENT_TOKEN_PASSWORD` | db/paiement/utility.js | Mot de passe token    |
| `PAYLICAN_PAYMENT`               | db/paiement/utility.js| URL endpoint paiement    |

---

## Paylican – Employeurs

| Variable              | Fichier                  | Usage                    |
|-----------------------|--------------------------|---------------------------|
| `PAYLICAN_API_URL`     | db/XYemployeurs/utility.js | URL API Paylican       |
| `PAYLICAN_CLIENT_ID`   | db/XYemployeurs/utility.js | Client ID              |
| `PAYLICAN_CLIENT_SECRET` | db/XYemployeurs/utility.js | Client secret          |

---

## Exemple de fichier `.env`

```env
PORT=3000
NODE_ENV=development

DB_NAME=cnss_db
DB_USER=root
DB_PASSWORD=votre_mot_de_passe
DB_HOST=localhost
DB_PORT=3306

redis_host=localhost
redis_port=6379

JWT_SECRET=changez-moi-en-production

OLD_DB_API_URL=http://192.168.56.128

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@cnss.gov.gn
SMTP_PASS=

smskey=
SMS_API_URL=
SMS_API_KEY=

PAYLICAN_TOKEN_URL=
PAYLICAN_PAYEMENT_TOKEN_USERNAME=
PAYLICAN_PAYEMENT_TOKEN_PASSWORD=
PAYLICAN_PAYMENT=

PAYLICAN_API_URL=
PAYLICAN_CLIENT_ID=
PAYLICAN_CLIENT_SECRET=
```
