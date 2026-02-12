# Route `get_employe_for_import` – Téléchargement du fichier Excel (liste employés pour déclaration)

Ce document décrit la route **GET `/get_employe_for_import`** du module cotisation employeur (`db/cotisation_employeur/route.full.js`, lignes 527-535). Elle permet à l’employeur connecté de **télécharger un fichier Excel** contenant la liste de ses employés immatriculés et encore en poste, pré-remplie pour être utilisée comme **modèle d’import** (ex. pour une déclaration de cotisation).

---

## Lien / URL de la route

| Élément | Valeur |
|--------|--------|
| **Méthode** | `GET` |
| **Chemin relatif** | `/get_employe_for_import` |
| **URL complète (1)** | **`GET /api/v1/cotisation_employeur/get_employe_for_import`** |
| **URL complète (2)** | `GET /api/cotisations-employeur/get_employe_for_import` |

*Router : `db/cotisation_employeur/route.full.js`, monté sur `/api/v1/cotisation_employeur` et `/api/cotisations-employeur`.*

---

## 1. Objectif

- Récupérer la liste des employés **immatriculés** et **encore en poste** (`is_imma: true`, `is_out: false`) de l’employeur connecté.
- Générer un **fichier Excel** avec les colonnes : N° Immatriculation, Matricule, Prénom(s), Nom, Salaire.
- Retourner ce fichier en **binaire** (téléchargement) pour que le front puisse le proposer en téléchargement ou l’utiliser comme base pour une déclaration.

**Aucun paramètre** en query : les données dépendent uniquement du token employeur.

---

## 2. Requête

- **Méthode :** `GET`
- **URL :** **`GET /api/v1/cotisation_employeur/get_employe_for_import`** (ou `/api/cotisations-employeur/get_employe_for_import`).
- **Authentification :** `EmployeurToken` obligatoire.
- **Query :** aucun.
- **Body :** aucun.

### Headers côté front

| Header | Valeur | Obligatoire |
|--------|--------|-------------|
| `Authorization` | `Bearer <token_employeur>` | Oui |

---

## 3. Réponse backend

### Succès (200)

- **Content-Type :** non défini explicitement par le backend (réponse binaire = buffer Excel).
- **Body :** contenu **binaire** du fichier Excel (format xlsx généré par `getImportFileForDeclaration`).

Le backend ne renvoie **pas** d’en-tête `Content-Disposition` ni de nom de fichier. C’est au **front** de gérer le téléchargement et le nom du fichier (ex. `fiche_declaration.xlsx`).

### Erreur (400)

- **Body JSON :** `{ "message": "Erreur interne" }`  
  (ex. erreur base de données ou lors de la génération du fichier.)

### Erreur (401)

- Token manquant, invalide ou expiré → réponse standard du middleware `EmployeurToken`.

---

## 4. Contenu du fichier Excel

Colonnes générées (d’après `utility2.getImportFileForDeclaration`) :

| Colonne Excel | Champ source | Description |
|---------------|--------------|-------------|
| N°immatriculation | `no_immatriculation` | Numéro d’immatriculation |
| Matricule | `matricule` | Matricule interne |
| Prenom(s) | `first_name` | Prénom(s) |
| Nom | `last_name` | Nom |
| Salaire | `salary` | Salaire |

Une ligne par employé (immatriculé et non sorti) de l’employeur connecté.  
Nom logique de la feuille / fichier côté utilitaire : **`fiche_declaration`** (à utiliser comme nom de fichier suggéré si besoin).

---

## 5. Comportement attendu du front

### 5.1 Appel de la route

- Envoyer une requête **GET** sur l’URL complète (ex. `https://api.example.com/api/v1/cotisation_employeur/get_employe_for_import`).
- Ajouter le header **`Authorization: Bearer <token_employeur>`**.
- Traiter la réponse comme un **blob** ou **arraybuffer** (pas du JSON).

### 5.2 En cas de succès (status 200)

- Récupérer le **body** en binaire (blob / arraybuffer).
- Déclencher un **téléchargement** côté utilisateur avec un nom de fichier explicite, par exemple :  
  **`fiche_declaration.xlsx`** (ou `fiche_declaration_<date>.xlsx`).
- Ne pas ouvrir la réponse comme du JSON (sinon erreur ou fichier corrompu).

### 5.3 En cas d’erreur (400 / 401)

- Si le **Content-Type** est `application/json` (ou que le body est du texte), parser le JSON et afficher `message` à l’utilisateur (ex. « Erreur interne », « Token expiré »).
- Ne pas proposer de téléchargement.

### 5.4 UX recommandée

- Bouton du type **« Télécharger le modèle / Liste des employés pour déclaration »**.
- Au clic : appel GET → si 200, déclencher le téléchargement du fichier avec le nom choisi ; si erreur, afficher un message d’erreur (toast, alerte, etc.).

---

## 6. Exemples de code front

### 6.1 Fetch + téléchargement (navigateur)

```javascript
async function downloadEmployeForImport() {
  const token = getEmployeurToken(); // à récupérer depuis votre store / auth
  const baseUrl = 'https://api.example.com'; // ou process.env.VITE_API_URL
  const url = `${baseUrl}/api/v1/cotisation_employeur/get_employe_for_import`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'Erreur interne' }));
      throw new Error(err.message || 'Téléchargement impossible');
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'fiche_declaration.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (e) {
    console.error(e);
    // Afficher un message à l'utilisateur : e.message
  }
}
```

### 6.2 Axios (avec responseType blob)

```javascript
const response = await axios.get(
  `${baseUrl}/api/v1/cotisation_employeur/get_employe_for_import`,
  {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'blob',
  }
);

const blob = response.data;
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'fiche_declaration.xlsx';
a.click();
window.URL.revokeObjectURL(url);
```

### 6.3 Lien direct (téléchargement par le navigateur)

Si vous préférez un simple lien (avec token en query, **moins recommandé** pour des raisons de sécurité) :

- **Ne pas** exposer le token dans l’URL en production.  
- En général, privilégier un **bouton** qui fait un `fetch` + création d’un blob + clic sur un `<a download>` comme ci-dessus.

---

## 7. Récapitulatif

| Étape | Action front |
|-------|----------------|
| 1 | GET `/api/v1/cotisation_employeur/get_employe_for_import` avec `Authorization: Bearer <token>`. |
| 2 | Vérifier `response.ok` (200 = succès). |
| 3 | Si 200 : lire le body en **blob** / **arraybuffer**, puis déclencher téléchargement avec nom **`fiche_declaration.xlsx`**. |
| 4 | Si 400/401 : lire le body en JSON si possible et afficher `message`. |
| 5 | Ne jamais parser la réponse 200 comme du JSON. |

---

## 8. Intégration dans le parcours déclaration

Cette route sert à **obtenir un fichier Excel pré-rempli** avec les employés éligibles (immatriculés, en poste). Le front peut :

1. Proposer **« Télécharger la liste / le modèle »** avant ou pendant la déclaration.
2. L’utilisateur peut ouvrir le fichier, le compléter ou le réutiliser.
3. Selon le besoin métier, ce fichier peut aussi servir de base pour un **import** (si une autre route d’import existe côté backend).

En résumé : le front doit **toujours** traiter la réponse en **fichier binaire** et gérer lui-même le **nom de fichier** et le **téléchargement**.
