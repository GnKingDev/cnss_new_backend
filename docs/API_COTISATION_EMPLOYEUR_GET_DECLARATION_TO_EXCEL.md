# Route `get_declaration_to_excel/:id` – Export Excel d’une déclaration

Ce document décrit la route **GET `/get_declaration_to_excel/:id`** du module cotisation employeur (`db/cotisation_employeur/route.full.js`, lignes 717-741). Elle permet à l’employeur connecté de **télécharger un fichier Excel** contenant le détail d’**une déclaration de cotisation** (une période donnée) : liste des employés déclarés avec matricule, immatriculation, nom, prénom, salaire brut, salaire soumis à cotisation, part employeur et part employé.

---

## 1. URL et méthode

| Élément | Valeur |
|--------|--------|
| **Méthode** | `GET` |
| **Chemin** | `/get_declaration_to_excel/:id` |
| **URL complète** | **`GET /api/v1/cotisation_employeur/get_declaration_to_excel/:id`** (ou `/api/cotisations-employeur/get_declaration_to_excel/:id`) |
| **Authentification** | **EmployeurToken** : `Authorization: Bearer <token_employeur>` |

**`:id`** = identifiant de la **déclaration** (cotisation_employeur), pas de l’employé. On l’obtient en général depuis la liste des déclarations (route **GET /list**), où chaque élément a un champ **`id`**.

---

## 2. Objectif

- Récupérer **une déclaration** (cotisation) par son **id** pour l’employeur connecté.
- Charger les **lignes de déclaration** (declarations_employes) avec les infos **employé** (matricule, no_immatriculation, first_name, last_name).
- Construire un **fichier Excel** avec une ligne par employé déclaré et les colonnes : Matricule, N° immatriculation, Prénom(s), Nom, Salaire brut, Salaire soumis à cotisation, Part employeur, Part employé.
- Retourner ce fichier en **binaire** (téléchargement). Le nom logique du fichier est dérivé de la période et de l’année (ex. `JANVIER-2025`), mais le backend ne renvoie pas d’en-tête `Content-Disposition` : le front peut proposer un nom du type `declaration_<periode>_<year>.xlsx`.

---

## 3. Requête

- **GET** avec **Authorization: Bearer &lt;token&gt;**.
- **Paramètre de route** : **`id`** = id de la déclaration (cotisation_employeur).

**Exemple :**

```
GET /api/v1/cotisation_employeur/get_declaration_to_excel/42
Authorization: Bearer <token_employeur>
```

---

## 4. Réponses

### 4.1 Succès (200)

- **Body** : contenu **binaire** du fichier Excel (buffer).
- **Content-Type** : non défini explicitement par le backend.
- Le front doit traiter la réponse en **blob** / **arraybuffer** et déclencher un téléchargement avec un nom de fichier (ex. `declaration_JANVIER_2025.xlsx` ou `declaration_42.xlsx`).

### 4.2 Déclaration introuvable (404)

- **Body JSON** : `{ "message": "Déclaration introuvable" }`  
  (id invalide, ou déclaration qui n’existe pas / n’appartient pas à l’employeur ; dans le code actuel la vérification d’appartenance à l’employeur n’est pas explicite, le backend s’appuie sur le fait que l’id existe et que les données sont chargées).

### 4.3 Erreur (400)

- En cas d’exception (ex. erreur lors de l’export) : réponse **400** avec corps texte **`"Erreur export"`** (pas de JSON).

### 4.4 Erreur (401)

- Token manquant, invalide ou expiré.

---

## 5. Contenu du fichier Excel

Colonnes générées (d’après `utility2.exportDeclaration`) :

| Colonne Excel | Source |
|---------------|--------|
| Matricule | `employe.matricule` |
| N° immatriculation | `employe.no_immatriculation` |
| Prénom(s) | `employe.first_name` |
| Nom | `employe.last_name` |
| Salaire brut | `declaration_employe.salary_brut` |
| Salaire soumis à cotisation | `declaration_employe.salary_soumis_cotisation` (ssc) |
| Part employeur | `declaration_employe.cotisation_emplyeur` |
| Part employe | `declaration_employe.cotisation_employe` |

Une ligne par **ligne de déclaration** (chaque employé inclus dans cette cotisation). Le nom de la feuille (ou du fichier suggéré) est de la forme **`<periode>-<year>`** (ex. `JANVIER-2025`).

---

## 6. Comportement du front

1. **Récupérer l’id** de la déclaration (depuis la liste **GET /list** : champ **`id`** de chaque élément).
2. **Appel** : `GET /api/v1/cotisation_employeur/get_declaration_to_excel/<id>` avec **Authorization: Bearer &lt;token&gt;**.
3. **Réponse 200** : traiter le body en **blob** / **arraybuffer**, créer un lien de téléchargement et proposer un nom de fichier (ex. `declaration_<periode>_<year>.xlsx` si vous avez la période/année côté front, sinon `declaration_<id>.xlsx`).
4. **404** : afficher « Déclaration introuvable ».
5. **400** : afficher « Erreur export » (ou message générique).
6. **401** : gérer la session (reconnexion, rafraîchissement du token).

---

## 7. Récapitulatif

| Élément | Détail |
|--------|--------|
| **Usage** | Exporter en Excel le détail d’**une** déclaration (liste des employés déclarés + salaires et cotisations). |
| **Id** | Id de la **déclaration** (cotisation_employeur), pas de l’employé. |
| **Réponse 200** | Fichier Excel binaire ; le front gère le téléchargement et le nom du fichier. |
| **Erreurs** | 404 (déclaration introuvable), 400 (erreur export), 401 (token). |

Cette route sert donc à **télécharger l’export Excel d’une déclaration** déjà listée (par ex. depuis la vue Consultation / GET /list).
