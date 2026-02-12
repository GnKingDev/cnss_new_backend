# Procédure d’ajout d’un employé (save_employe)

Ce document décrit la procédure côté backend pour l’**ajout d’un employé** via la route `POST /api/v1/employe/save_employe` (référence : `db/employe/route.js`, lignes 171-222).

---

## 1. Vue d’ensemble

L’employeur connecté envoie les **données de l’employé** (JSON) et **trois fichiers obligatoires** (CNI, contrat, photo). Le backend vérifie les fichiers, parse les données, applique des règles (employeur, nationalité, préfecture), enregistre les chemins des fichiers, crée l’employé en base, recharge l’employé avec les associations, puis renvoie l’employé créé.

---

## 2. Étape par étape (côté backend)

### 2.1 Authentification et format de la requête

- **Méthode :** `POST`
- **URL :** `/api/v1/employe/save_employe`
- **Middleware :** `EmployeurToken` → l’employeur doit être connecté (`req.user.user_id`).
- **Body :** `multipart/form-data` avec :
  - un champ **`employe`** : chaîne JSON contenant toutes les données de l’employé ;
  - trois champs **fichiers** (noms définis par `employeFileFields`) :
    - **`cni`** : 1 fichier (CNI) ;
    - **`contrat_file`** : 1 fichier (contrat) ;
    - **`avatar`** : 1 fichier (photo de profil).

---

### 2.2 Validation des fichiers obligatoires

Le backend lit `req.files` et vérifie la présence de **chaque fichier** :

| Fichier        | Clé dans `req.files` | Si absent → réponse |
|----------------|----------------------|----------------------|
| CNI            | `cni`                | **400** – `"Fichier CNI requis"` |
| Contrat        | `contrat_file`       | **400** – `"Fichier contrat requis"` |
| Photo de profil| `avatar`             | **400** – `"Photo de profil requise"` |

Dès qu’un de ces fichiers manque, la requête est rejetée (400) et la suite n’est pas exécutée.

---

### 2.3 Parsing des données employé

- Le corps contient un champ **`employe`** (chaîne JSON).
- Le backend fait :  
  `data = JSON.parse(req.body.employe)`  
  Toute erreur de parsing entre dans le `catch` et peut renvoyer une erreur générique (ex. 400).

---

### 2.4 Enrichissement des données (employeur, préfecture, fichiers)

Le backend **ne demande pas** `employeurId` ni les chemins des fichiers dans le JSON : il les **ajoute** côté serveur.

- **Employeur :**  
  `data.employeurId = req.user.user_id`  
  (l’employé est rattaché à l’employeur connecté.)

- **Préfecture :**  
  `data.prefectureId = data.prefecture`  
  (le champ `prefecture` du JSON est mappé vers `prefectureId` en base.)

- **Chemins des fichiers :**  
  - `data.avatar = files['avatar'][0].path`  
  - `data.cni_file = files['cni'][0].path`  
  - `data.contrat_file = files['contrat_file'][0].path`  

- **Date première embauche :**  
  `data.date_first_embauche = data.worked_date`  
  (copie du champ “date d’embauche” du formulaire.)

Tout le reste (nom, prénom, email, téléphone, nationalité, etc.) vient du JSON `employe`. Si une validation métier existe (ex. nationalité « Guinée » ou « Autre »), elle est appliquée sur `data` avant ou lors de la création.

---

### 2.5 Création en base et rechargement

- **Création :**  
  `employe = await Employe.create(data)`  
  Toutes les propriétés de `data` (y compris `employeurId`, `prefectureId`, chemins des fichiers, etc.) sont enregistrées dans la table des employés.

- **Rechargement avec associations :**  
  `await employe.reload({ include: [ { association: 'employeur' }, { association: 'prefecture' } ] })`  
  L’objet `employe` contient alors les infos employeur et préfecture (pour la réponse).

---

### 2.6 Réponse succès

- **Statut :** **200**
- **Body :** l’objet **employé** créé (avec `employeur` et `prefecture` inclus).  
  Le front peut l’utiliser pour afficher la fiche ou rediriger.

---

### 2.7 Gestion des erreurs (catch)

- **Contrainte unique ou validation Sequelize**  
  (ex. email/téléphone déjà existant, règle métier) :  
  → **400** avec `message` traduit via `utility.translateSqlError(error.message)`.

- **Toute autre erreur** (ex. parsing, base, fichier) :  
  → **400** avec `message` : `"Erreur lors de la création de l'employé"` (ou message d’erreur générique).

Les erreurs sont loguées côté serveur (`[EMPLOYE_SAVE] Error:`).

---

## 3. Schéma récapitulatif

```
Frontend                          Backend (save_employe)
   |                                       |
   |  POST /api/v1/employe/save_employe     |
   |  Authorization: Bearer <token>        |
   |  multipart: employe (JSON) +          |
   |    cni, contrat_file, avatar          |
   |-------------------------------------->|
   |                                       | 1. Vérifier fichiers (cni, contrat, avatar)
   |                                       | 2. JSON.parse(req.body.employe)
   |                                       | 3. data.employeurId = req.user.user_id
   |                                       | 4. data.prefectureId = data.prefecture
   |                                       | 5. data.avatar, .cni_file, .contrat_file (paths)
   |                                       | 6. data.date_first_embauche = data.worked_date
   |                                       | 7. Employe.create(data)
   |                                       | 8. employe.reload(employeur, prefecture)
   |<--------------------------------------|
   |  200 + objet employé créé             |
   |  ou 400 (fichier manquant / erreur)   |
```

---

## 4. Option : vérification email / téléphone avant envoi

Avant d’appeler `save_employe`, le front peut appeler **`POST /api/v1/employe/save_employe_verify`** avec un body JSON contenant `data: { email, phone_number }`.  
Si la réponse est 200, email et téléphone sont considérés disponibles ; le front peut alors envoyer le formulaire complet + fichiers vers `save_employe`.  
Ce n’est pas obligatoire côté backend : `save_employe` ne fait pas cette vérification elle-même ; en cas de doublon, une contrainte unique en base renverra 400 avec le message traduit.

---

## 5. Résumé des points importants

| Élément | Détail |
|--------|--------|
| **Auth** | Token employeur obligatoire. |
| **Body** | `multipart/form-data` : champ `employe` (JSON) + 3 fichiers (`cni`, `contrat_file`, `avatar`). |
| **Fichiers** | Tous les trois obligatoires ; sinon 400 avec message explicite. |
| **Employeur** | Toujours pris de `req.user.user_id`, jamais du body. |
| **Préfecture** | Envoyée dans le JSON (`data.prefecture`) puis mappée en `data.prefectureId`. |
| **Nationalité** | Si utilisée : valeurs « Guinée » ou « Autre » (voir `docs/API_NATIONALITE.md`). |
| **Réponse 200** | Objet employé créé avec associations `employeur` et `prefecture`. |
| **Erreurs** | 400 (fichier manquant, JSON invalide, contrainte/validation) ; message en français quand c’est traduit. |
