# FormData – Grappe familiale (backend)

Lorsque le front envoie la famille avec des fichiers, il utilise **multipart/form-data** sur :

**`PATCH /api/v1/employe/:id/famille`**

Ce document décrit les champs à gérer côté backend (Multer) et comment le front doit envoyer les données.

---

## Champs envoyés

| Nom du champ FormData | Type | Description |
|------------------------|------|-------------|
| **`famille`** | string (JSON) | Payload complet famille (conjoints, enfants, parents) en snake_case. Même structure que la réponse GET/PATCH JSON. |
| **`photo_conjoint_<spouseId>`** | File | Photo du conjoint. `<spouseId>` = id du conjoint (ex. `42`, `sp1737123456789`). |
| **`certificat_mariage_<spouseId>`** | File | Certificat de mariage du conjoint. `<spouseId>` = id du conjoint. |
| **`photo_enfant_<childId>`** | File | Photo de l'enfant. `<childId>` = id de l'enfant. |
| **`extrait_enfant_<childId>`** | File | Extrait de naissance (PDF/image) de l'enfant. `<childId>` = id de l'enfant. |

---

## Exemples de noms de champs

- `famille`
- `photo_conjoint_sp1737123456789`
- `certificat_mariage_sp1737123456789`
- `photo_enfant_sp1737123456790_1`
- `extrait_enfant_sp1737123456790_1`

Les `<spouseId>` et `<childId>` correspondent aux champs **`id`** des conjoints et enfants dans le JSON `famille`.

---

## Où sont enregistrés les fichiers

- Tous les fichiers (photo employé, photo conjoint, certificat de mariage, photo enfant, extrait de naissance) sont enregistrés dans le dossier **`uploads/`** à la racine du projet.
- Ils sont servis en statique sous **`/uploads/...`** (même comportement que la photo de profil employé).
- En base, on stocke un chemin relatif du type **`uploads/nom-fichier-123.jpeg`**. La réponse API renvoie une URL du type **`/uploads/nom-fichier-123.jpeg`** (ou `null` s'il n'y a pas de fichier).

---

## Comment le front doit envoyer les données

1. **Construire un `FormData`**.
2. **Ajouter le champ `famille`** : `formData.append('famille', JSON.stringify({ spouses, parents }))` — structure en **snake_case** (nom, prenom, date_naissance, etc.).
3. **Pour chaque fichier sélectionné par l'utilisateur** : ajouter un champ dont le nom est exactement `photo_conjoint_` + id du conjoint, ou `certificat_mariage_` + id du conjoint, ou `photo_enfant_` + id de l'enfant, ou `extrait_enfant_` + id de l'enfant.
4. **Ne pas envoyer de placeholders** dans le JSON : pas de `photo: "/enfant/user.jpeg"` ni `extrait_naissance: "/enfant/user.pdf"`. Si aucun fichier n'est ajouté pour un conjoint/enfant, ne pas mettre ces clés ou les mettre à `null`. Le backend rejette les chemins qui ne commencent pas par `uploads/` et enregistre `null`.
5. **Requête** : `PATCH /api/v1/employe/:id/famille` avec `Content-Type: multipart/form-data` (géré automatiquement par le navigateur quand on envoie un `FormData`).

### Exemple JavaScript (front)

```javascript
const formData = new FormData();
formData.append('famille', JSON.stringify({
  spouses: [
    {
      id: 42,
      nom: 'COUMBASSA',
      prenom: 'Mariama',
      date_naissance: '1965-03-15',
      lieu_naissance: 'Kindia',
      profession: 'Enseignante',
      type_union: 'mariage',
      date_union: '1988-06-01',
      statut: 'actif',
      statut_dossier: 'en_cours_validation',
      certificat_mariage: null,
      photo: null,
      children: [
        {
          id: 'sp1737123456790_1',
          nom: 'COUMBASSA',
          prenom: 'Abdoulaye',
          date_naissance: '1990-05-12',
          lieu_naissance: 'Conakry',
          sexe: 'M',
          statut: 'majeur',
          statut_dossier: 'en_cours_validation',
          photo: null,
          extrait_naissance: null
        }
      ]
    }
  ],
  parents: { father: { ... }, mother: { ... } }
}));

// Fichiers (un seul par champ)
if (filePhotoConjoint) formData.append('photo_conjoint_42', filePhotoConjoint);
if (fileCertificat) formData.append('certificat_mariage_42', fileCertificat);
if (filePhotoEnfant) formData.append('photo_enfant_sp1737123456790_1', filePhotoEnfant);
if (fileExtrait) formData.append('extrait_enfant_sp1737123456790_1', fileExtrait);

const response = await fetch(`/api/v1/employe/${employeId}/famille`, {
  method: 'PATCH',
  headers: { 'Authorization': 'Bearer ' + token },
  body: formData
});
```

---

## Rappel

- Un seul fichier par champ (un champ par conjoint/enfant concerné).
- Si aucun fichier n'est ajouté pour une modification, le front envoie uniquement le champ **`famille`** (JSON).
- Il n'y a **pas de lien PDF ni image par défaut** pour conjoint et enfant : en l'absence de fichier, l'API renvoie `photo`, `certificat_mariage`, `extrait_naissance` à **`null`**.
