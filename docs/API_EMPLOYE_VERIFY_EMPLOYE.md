# Route verify_employe – Réception et réponses

**Route :** `POST /api/v1/employe/verify_employe`  
**Objectif :** Vérifier si un employé (identifié par son numéro d’immatriculation) est **libre** (a quitté son ancien employeur) et peut être recruté par l’employeur connecté, ou le créer à partir de l’ancienne base si trouvé là-bas.

---

## 1. Comment le front envoie la requête

### Méthode et URL

- **Méthode :** `POST`
- **URL :** `/api/v1/employe/verify_employe`

### Headers

| Header | Valeur | Obligatoire |
|--------|--------|-------------|
| `Content-Type` | `application/json` | Oui (body JSON) |
| `Authorization` | `Bearer <token_employeur>` | Oui |

### Body (JSON)

Le front envoie un objet JSON avec un seul champ :

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| `code` | string | Oui | Numéro d’immatriculation de l’employé à vérifier. |

**Exemple de body :**

```json
{
  "code": "8204000123456"
}
```

---

## 2. Comment le backend répond

### Cas 1 : Code manquant (400)

- **Quand :** le champ `code` est absent ou vide.
- **Réponse :**

```json
{
  "message": "Code d'immatriculation requis"
}
```

---

### Cas 2 : Employé trouvé dans la nouvelle DB et **libre** (200)

- **Quand :** un employé avec ce `no_immatriculation` existe et `is_out === true` (a quitté son ancien employeur).
- **Réponse :** statut **200**, body = **objet employé** (avec préfecture inclus si configuré).

**Exemple :**

```json
{
  "id": 42,
  "first_name": "Mamadou",
  "last_name": "Diallo",
  "no_immatriculation": "8204000123456",
  "phone_number": "600123456",
  "email": "mamadou@example.com",
  "is_out": true,
  "is_imma": true,
  "employeurId": null,
  "prefectureId": 1,
  "prefecture": { "id": 1, "name": "Conakry", ... },
  ...
}
```

Le front peut utiliser cet objet pour afficher la fiche et proposer le recrutement (rattacher à l’employeur connecté).

---

### Cas 3 : Employé trouvé mais **pas encore libre** (400)

- **Quand :** un employé avec ce numéro existe et `is_out === false` (toujours chez un employeur).
- **Réponse :** statut **400**

```json
{
  "message": "Cet employé n'est pas encore libre"
}
```

---

### Cas 4 : Employé non trouvé dans la nouvelle DB, trouvé dans l’ancienne DB (200)

- **Quand :** aucun employé avec ce numéro dans la nouvelle DB, mais l’ancienne DB (API externe) renvoie des données pour ce numéro.
- **Comportement backend :** création d’un nouvel employé dans la nouvelle DB avec les données de l’ancienne DB, création de la carrière, puis réponse avec l’employé créé (ex. `is_imma: true`, `is_adhesion: true`, `is_insert_oldDB: true`).
- **Réponse :** statut **200**, body = **objet employé créé** (avec préfecture si incluse).

**Exemple :**

```json
{
  "id": 123,
  "first_name": "Mamadou",
  "last_name": "Diallo",
  "no_immatriculation": "8204000123456",
  "employeurId": 7,
  "is_imma": true,
  "is_adhesion": true,
  "is_insert_oldDB": true,
  ...
}
```

---

### Cas 5 : Employé non trouvé nulle part (400)

- **Quand :** aucun employé avec ce numéro ni dans la nouvelle DB ni dans l’ancienne DB (ou erreur lors de l’appel ancienne DB).
- **Réponse :** statut **400**

```json
{
  "message": "Employé non trouvé"
}
```

---

### Cas 6 : Erreur serveur ou token invalide

- **401** : token manquant ou invalide (ex. `{ "message": "Token manquant" }`).
- **400** (générique) : `{ "message": "Erreur" }` en cas d’exception non gérée côté backend.

---

## 3. Récapitulatif

| Situation | Statut | Body |
|------------|--------|------|
| `code` manquant | 400 | `{ "message": "Code d'immatriculation requis" }` |
| Employé trouvé, libre (`is_out: true`) | 200 | Objet employé |
| Employé trouvé, pas libre | 400 | `{ "message": "Cet employé n'est pas encore libre" }` |
| Non trouvé en nouvelle DB, trouvé en ancienne DB | 200 | Objet employé créé |
| Non trouvé nulle part | 400 | `{ "message": "Employé non trouvé" }` |
| Token invalide | 401 | `{ "message": "..." }` |

---

## 4. Exemple d’appel côté front

```javascript
const response = await fetch('/api/v1/employe/verify_employe', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${tokenEmployeur}`
  },
  body: JSON.stringify({ code: '8204000123456' })
});

const data = await response.json();

if (response.ok) {
  // 200 : employé libre ou créé depuis l’ancienne DB
  // data = objet employé
} else {
  // 400 ou 401 : data.message pour afficher l’erreur
}
```
