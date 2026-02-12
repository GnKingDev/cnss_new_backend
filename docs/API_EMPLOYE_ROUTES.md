# API Employés – Routes pour le frontend

**Base URL :** `/api/v1/employe`  
**Authentification :** les routes employeur utilisent le **token employeur** :  
`Authorization: Bearer <token>`

**Nationalité :** le champ `nationality` n’accepte que **« Guinée »** ou **« Autre »**. Voir `docs/API_NATIONALITE.md`.

---

## Statistiques employés (nombre total, immatriculés, non immatriculés)

### `GET /api/v1/employe/stats`

Retourne le **nombre d'employés** de l'employeur connecté : total, immatriculés, non immatriculés.

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Query :** aucun.

**Réponse 200 :**

```json
{
  "total": 831,
  "immatricules": 831,
  "nonImmatricules": 0 
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `total` | number | Nombre total d'employés de l'employeur. |
| `immatricules` | number | Nombre d'employés immatriculés (`is_imma: true`). |
| `nonImmatricules` | number | Nombre d'employés non encore immatriculés (`is_imma: false`). |

**Exemple d'affichage côté front :**

- Nombre d'employés : **831**
- Employés immatriculés : **831**
- Employés non immatriculés : **0**

**Erreurs :**

- **401** — Token manquant, invalide ou expiré.
- **500** — Erreur serveur.

---

## Liste des employés avec recherche

### `GET /api/v1/employe/list`

Retourne la **liste paginée** des employés actifs de l'employeur connecté.  
Recherche possible par **matricule**, **nom**, **prénom**, **immatriculation**, **numéro de téléphone**.

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Query :**

| Paramètre | Type | Description |
|-----------|------|-------------|
| `page` | number | Numéro de page (défaut : 1). |
| `limit` | number | Nombre d'éléments par page (défaut : 50, max : 100). |
| `search` | string | **Recherche globale** : un seul terme recherché dans matricule, nom, prénom, immatriculation et téléphone (LIKE). |
| `matricule` | string | Filtre sur le matricule (LIKE). |
| `nom` | string | Filtre sur le nom (last_name) (LIKE). |
| `prenom` | string | Filtre sur le prénom (first_name) (LIKE). |
| `immatriculation` | string | Filtre sur le numéro d'immatriculation (no_immatriculation) (LIKE). |
| `telephone` | string | Filtre sur le numéro de téléphone (LIKE). |

**Comportement :**

- Si **`search`** est renseigné : la recherche s'applique à **tous** les champs ci‑dessus (OR). Les autres paramètres de recherche sont ignorés.
- Si **`search`** est absent : les paramètres **matricule**, **nom**, **prenom**, **immatriculation**, **telephone** peuvent être utilisés seuls ou combinés (AND entre les critères renseignés).

**Exemples :**

- `GET /api/v1/employe/list` — tous les employés (paginé).
- `GET /api/v1/employe/list?search=Dupont` — tous les employés dont matricule, nom, prénom, immatriculation ou téléphone contient « Dupont ».
- `GET /api/v1/employe/list?nom=Diallo&prenom=Mamadou` — employés avec nom contenant « Diallo » **et** prénom contenant « Mamadou ».
- `GET /api/v1/employe/list?immatriculation=8204&page=1&limit=20` — employés dont le n° d'immatriculation contient « 8204 », page 1, 20 par page.

**Réponse 200 :**

```json
{
  "data": [
    {
      "id": 1,
      "first_name": "Mamadou",
      "last_name": "Diallo",
      "phone_number": "600123456",
      "matricule": "MAT001",
      "no_immatriculation": "8204000123456",
      "is_imma": true,
      "employeurId": 42,
      ...
    }
  ],
  "pagination": {
    "total": 831,
    "page": 1,
    "limit": 50
  }
}
```

**Erreurs :**

- **401** — Token manquant, invalide ou expiré.
- **400** — Erreur de requête (ex. paramètres invalides).

---

## Import Excel des employés

### `POST /api/v1/employe/import_excel`

Importe des employés à partir d’un fichier **Excel (.xlsx)**. Le fichier doit contenir une première ligne d’en-têtes puis une ligne par employé.

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Body :** `multipart/form-data` avec un champ fichier nommé **`excel`** (fichier .xlsx).

**Colonnes attendues (première ligne) :**

| Colonne Excel | Obligatoire | Description |
|---------------|-------------|-------------|
| Prenom | Oui | Prénom |
| Nom | Oui | Nom |
| Email (facultatif) | Non | Si vide, la valeur enregistrée est **null**. |
| Telephone (facultatif) | Non | Si vide : **null**. |
| Genre | Non | Genre |
| Date Naissance | Non | Date de naissance |
| Prefecture de Naissance | Non | **Nom** de la préfecture (recherche par nom → prefectureId) |
| Date d'Embauche | Non | Date d’embauche |
| Salaire Brut | Non | Salaire (nombre) |
| Type de Contrat | Non | Type de contrat |
| Matricule (facultatif) | Non | Matricule |
| Prenom du père / Nom du père | Non | Père |
| Prenom de la mère / Nom de la mère | Non | Mère |
| Fonction | Non | Fonction |
| Situation matrimoniale | Non | Situation matrimoniale |

**Comportement :**

- Toutes les lignes sont **validées** avant tout enregistrement.
- Pour **« Prefecture de Naissance »** : recherche par **nom** dans la table des préfectures (insensible à la casse). Si aucune préfecture ne correspond → erreur pour cette ligne.
- Si un **email** ou un **téléphone** existe déjà en base → erreur pour cette ligne.
- **Dès qu’il y a au moins une erreur** : **aucun** employé du fichier n’est créé. La réponse contient la liste de toutes les erreurs (ligne, champ, message en français).
- Si **aucune erreur** : tous les employés sont créés en une seule transaction (max 1000 par fichier).
- Les employés importés sont créés avec **`is_imma: false`** : ce sont des **nouveaux employés en attente de validation par DIRGA** (non immatriculés tant qu’ils n’ont pas été validés).

**Réponse 200 (succès) :**

```json
{
  "success": true,
  "message": "12 employé(s) importé(s) avec succès.",
  "count": 12
}
```

**Réponse 400 (erreurs de validation) :**

```json
{
  "success": false,
  "message": "Import annulé : des erreurs ont été détectées. Corrigez le fichier et réessayez.",
  "errors": [
    { "row": 2, "field": "Email", "message": "Un employé avec cet email existe déjà." },
    { "row": 4, "field": "Prefecture de Naissance", "message": "Préfecture introuvable : \"Conakry\"." }
  ],
  "errorsText": "Ligne 2 - Email : Un employé avec cet email existe déjà.\nLigne 4 - Prefecture de Naissance : Préfecture introuvable : \"Conakry\"."
}
```

**Erreurs :**

- **400** — Fichier manquant, fichier invalide, ou liste d’erreurs de validation (voir ci-dessus).
- **401** — Token manquant ou invalide.
- **500** — Erreur serveur.

**Note :** Le backend supprime le fichier uploadé après traitement.

---

## Import Excel employés déjà immatriculés (adhesion)

### `POST /api/v1/employe/import_excel_adhesion`

Importe des **employés déjà immatriculés** (adhesion) depuis un fichier Excel.  
Créés avec **`is_imma: false`** et **`is_adhesion: true`**.

**Headers :**  
`Authorization: Bearer <token_employeur>`

**Body :** `multipart/form-data` avec un champ fichier nommé **`excel`** (fichier .xlsx).

**Colonnes attendues (première ligne) :**

| Colonne Excel | Obligatoire | Description |
|---------------|-------------|-------------|
| N° Immatriculation | Oui | Numéro d'immatriculation (unique). |
| Prenom | Oui | Prénom. |
| Nom | Oui | Nom. |
| Email (facultatif) | Non | Si vide : **null**. |
| Telephone (facultatif) | Non | Si vide : **null**. |
| Salaire Brut | Non | Salaire (nombre). |
| Type de Contrat | Non | Type de contrat. |
| Matricule (facultatif) | Non | Matricule. |
| Fonction | Non | Fonction. |

**Comportement :**

- Même logique de validation que l’import classique : en cas d’erreur (n° immatriculation déjà existant, email/téléphone en doublon, etc.), **aucun** enregistrement, liste d’erreurs en français.
- Chaque employé est créé avec **`is_imma: false`** et **`is_adhesion: true`**.

**Réponse 200 (succès) :**

```json
{
  "success": true,
  "message": "5 employé(s) déjà immatriculés importé(s) avec succès.",
  "count": 5
}
```

**Erreurs :** 400 (fichier manquant, erreurs de validation), 401, 500.
