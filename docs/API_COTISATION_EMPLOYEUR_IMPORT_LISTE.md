# Route `import_liste` – Import d’une liste employés (fichier Excel) pour déclaration

Ce document décrit comment le **front** doit se comporter avec la route **POST `/import_liste`** du module cotisation employeur. Cette route permet d’**envoyer un fichier Excel** (même format que le modèle téléchargé via `get_employe_for_import`), de le **valider** côté backend, puis de recevoir la **liste des employés avec cotisations calculées**, paginée, prête pour la suite du parcours déclaration.

---

## 1. URL et méthode

| Élément | Valeur |
|--------|--------|
| **Méthode** | `POST` |
| **Chemin** | `/import_liste` |
| **URL complète (1)** | **`POST /api/v1/cotisation_employeur/import_liste`** |
| **URL complète (2)** | `POST /api/cotisations-employeur/import_liste` |
| **Authentification** | **EmployeurToken** : `Authorization: Bearer <token_employeur>` |

---

## 2. Format de la requête

- **Content-Type :** `multipart/form-data` (envoi d’un fichier + paramètres).
- **Champs du formulaire :**

| Champ | Type | Obligatoire | Description |
|-------|------|-------------|-------------|
| **`excel`** | Fichier | Oui | Fichier Excel (.xlsx) : même format que l’export de **get_employe_for_import** (colonnes N° Immatriculation, Salaire obligatoires). |
| **`data`** | String (JSON) ou Object | Oui | JSON contenant au minimum **`year`**. Optionnel : `periode`, `page`, `pageSize`. |

**Exemple de structure `data` (en JSON string ou objet) :**

```json
{
  "year": 2026,
  "periode": "MARS",
  "page": 1,
  "pageSize": 20
}
```

- **`year`** : obligatoire (année de la déclaration, utilisée pour les calculs de cotisation).
- **`periode`** : optionnel (ex. `"JANVIER"`, `"MARS"`). Si fourni, le backend vérifie que cette période n’est pas déjà déclarée.
- **`page`** / **`pageSize`** : optionnels (pagination de la réponse, défaut 1 et 10, pageSize max 100).

---

## 3. Format du fichier Excel

Le fichier doit avoir **exactement le même format** que celui téléchargé via **GET `/get_employe_for_import`** :

- **Première ligne :** en-têtes.
- **Colonnes obligatoires :**
  - **N° Immatriculation** (ou variantes reconnues : N°immatriculation, No Immatriculation, etc.).
  - **Salaire** (nombre, **≥ 0**, pas de valeur négative).
- **Colonnes optionnelles** (reconnues mais pas obligatoires) : Matricule, Prénom(s), Nom.

Règles métier côté backend :

- **N° Immatriculation** : obligatoire pour chaque ligne (non vide).
- **Salaire** : obligatoire, doit être un **nombre** et **≥ 0** (sinon erreur détaillée par ligne).

---

## 4. Comportement attendu du front

### 4.1 Avant l’envoi

1. L’utilisateur choisit un fichier Excel (idéalement le modèle téléchargé via `get_employe_for_import`, complété avec les salaires).
2. Le front saisit ou fixe **l’année** (obligatoire) et optionnellement la **période**, la page, le pageSize.
3. Construire le **FormData** :
   - Ajouter le fichier sous le nom **`excel`**.
   - Ajouter **`data`** : soit une chaîne JSON (ex. `JSON.stringify({ year: 2026, periode: 'MARS', page: 1, pageSize: 20 })`), soit selon la capacité de la lib (axios peut envoyer un objet pour un champ).

### 4.2 Envoi

- **POST** sur l’URL complète avec **Authorization: Bearer &lt;token_employeur&gt;**.
- **Body** = FormData (champ `excel` + champ `data`).

### 4.3 Réponse 200 (succès)

- Le backend a accepté le fichier, validé toutes les lignes et trouvé les employés en base.
- **Body** : objet **paginé** au format habituel :

```json
{
  "totalItems": 45,
  "totalPages": 3,
  "currentPage": 1,
  "pageSize": 20,
  "data": [
    {
      "id": 1,
      "first_name": "...",
      "last_name": "...",
      "no_immatriculation": "8204000123456",
      "salary": 1200000,
      "type_contrat": "CDI",
      "employeurId": 7,
      "salary_soumis_cotisation": 1200000,
      "cotisation_employe": 60000,
      "cotisation_emplyeur": 216000,
      "total_cotisation": 276000
    }
  ]
}
```

**Comportement front :**

- Afficher la liste (tableau) avec les colonnes utiles (nom, prénom, N° immatriculation, salaire, cotisations, etc.).
- Proposer la pagination si `totalPages` > 1 (réutiliser `page` / `pageSize` pour un nouvel appel si besoin, ou garder la même liste en mémoire).
- Utiliser cette liste pour l’étape suivante (ex. **declare-periode** avec ces employés + totaux).

### 4.4 Réponse 400 (erreurs de validation ou métier)

Le backend renvoie un **JSON** avec au moins un **`message`** et souvent une liste **`errors`** et un **`errorsText`**.

**Cas possibles :**

| Situation | `message` (exemple) | `errors` | Comportement front |
|-----------|---------------------|----------|---------------------|
| Fichier manquant | `"Fichier Excel requis"` | — | Afficher que le fichier est obligatoire. |
| `data` invalide ou manquant | `"Paramètre \"data\" (JSON) invalide"` / `"L'année (year) est requise dans data"` | — | Vérifier la présence de `data` et de `year`. |
| Période déjà déclarée | `"Cette période a déjà été déclarée"` | — | Afficher le message et proposer une autre période ou annuler. |
| Fichier sans en-têtes / sans données | `"Le fichier doit contenir une ligne d'en-têtes et au moins une ligne de données."` | `[]` ou avec détails | Inviter à utiliser le bon modèle. |
| Colonne(s) obligatoire(s) manquante(s) | `"Colonne(s) obligatoire(s) manquante(s) : N° Immatriculation, Salaire. ..."` | `[{ row, field, message }]` | Afficher le message et la liste des colonnes manquantes. |
| Erreurs par ligne (salaire vide, négatif, N° immatriculation vide, etc.) | `"Import annulé : des erreurs ont été détectées dans le fichier. Corrigez et réessayez."` | `errors` (ligne, champ, message) | Afficher **`errors`** (ex. tableau ou liste) et/ou **`errorsText`** (texte bloc). |
| Employé non trouvé ou non éligible | `"Import annulé : des erreurs ont été détectées. ..."` | `errors` avec message du type "Employé non trouvé ou non éligible pour cet employeur : \"xxx\""` | Afficher les lignes concernées et inviter à corriger le fichier. |
| Aucun employé à déclarer | `"Aucun employé à déclarer pour cette période"` | — | Afficher le message. |

**Structure typique d’une réponse 400 avec erreurs détaillées :**

```json
{
  "message": "Import annulé : des erreurs ont été détectées dans le fichier. Corrigez et réessayez.",
  "errors": [
    { "row": 2, "field": "Salaire", "message": "Le salaire ne peut pas être négatif." },
    { "row": 5, "field": "N° Immatriculation", "message": "Employé non trouvé ou non éligible pour cet employeur : \"8204000999999\"." }
  ],
  "errorsText": "Ligne 2 - Salaire : Le salaire ne peut pas être négatif.\nLigne 5 - N° Immatriculation : Employé non trouvé ou non éligible pour cet employeur : \"8204000999999\"."
}
```

**Comportement front recommandé :**

- Afficher **`message`** en résumé (toast, alerte, bandeau).
- Afficher la liste **`errors`** (numéro de ligne, champ, message) pour que l’utilisateur puisse corriger le fichier.
- Optionnel : afficher **`errorsText`** dans un bloc texte ou pour export/copier-coller.

### 4.5 Réponse 401

- Token manquant, invalide ou expiré → rediriger vers la connexion ou rafraîchir le token.

---

## 5. Parcours utilisateur recommandé

1. **Télécharger le modèle** : GET **`/get_employe_for_import`** → l’utilisateur récupère un Excel pré-rempli (N° Immatriculation, Matricule, Prénom(s), Nom, Salaire).
2. **Compléter / modifier** : l’utilisateur garde au minimum **N° Immatriculation** et **Salaire** (≥ 0) pour chaque ligne.
3. **Choisir année (et optionnellement période)** dans le formulaire front.
4. **Importer** : POST **`/import_liste`** avec le fichier (`excel`) et `data` (dont `year`).
5. **Si 200** : afficher la liste paginée (employés + cotisations) et proposer la suite (ex. déclaration / facture).
6. **Si 400** : afficher `message` et `errors` (et éventuellement `errorsText`), inviter à corriger le fichier et réessayer.

---

## 6. Exemple de code front (Fetch + FormData)

```javascript
async function importListe(file, year, periode = null, page = 1, pageSize = 20) {
  const formData = new FormData();
  formData.append('excel', file);
  formData.append('data', JSON.stringify({
    year,
    ...(periode && { periode }),
    page,
    pageSize
  }));

  const response = await fetch(`${API_BASE}/api/v1/cotisation_employeur/import_liste`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getEmployeurToken()}`
    },
    body: formData
  });

  const body = await response.json();

  if (!response.ok) {
    if (body.errors && body.errors.length) {
      body.errors.forEach(e => console.warn(`Ligne ${e.row} - ${e.field}: ${e.message}`));
      // Afficher body.message + body.errors (ou body.errorsText) à l'utilisateur
    }
    throw new Error(body.message || 'Erreur lors de l\'import');
  }

  return body;
}
```

---

## 7. Récapitulatif

| Étape | Action front |
|-------|----------------|
| 1 | Envoyer **POST** avec **Authorization**, body **multipart** : champ **`excel`** (fichier), champ **`data`** (JSON avec au moins **`year`**). |
| 2 | Si **200** : utiliser **`data`** (liste paginée) + **totalItems**, **totalPages**, **currentPage**, **pageSize** pour afficher et pour la suite du flux. |
| 3 | Si **400** : lire **`message`** et **`errors`** (et **`errorsText`** si besoin), afficher les erreurs de façon détaillée et ne pas considérer l’import comme réussi. |
| 4 | S’assurer que le fichier respecte le format du modèle (colonnes **N° Immatriculation** et **Salaire** obligatoires, salaire ≥ 0). |
