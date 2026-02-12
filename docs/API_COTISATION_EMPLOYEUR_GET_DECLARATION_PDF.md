# Route `get_declaration_pdf/:id` – Export PDF d’une déclaration

Ce document décrit la route **GET `/get_declaration_pdf/:id`** du module cotisation employeur (`db/cotisation_employeur/route.full.js`, lignes 743-767). Elle permet à l’employeur connecté de **télécharger un fichier PDF** contenant le détail d’**une déclaration de cotisation** (une période) : liste des employés déclarés avec matricule, N° immatriculation, prénom, nom, salaire brut, salaire soumis à cotisation, part employeur et part employé, mis en forme pour impression (génération via Puppeteer / utility3).

---

## 1. URL et méthode

| Élément | Valeur |
|--------|--------|
| **Méthode** | `GET` |
| **Chemin** | `/get_declaration_pdf/:id` |
| **URL complète** | **`GET /api/v1/cotisation_employeur/get_declaration_pdf/:id`** (ou `/api/cotisations-employeur/get_declaration_pdf/:id`) |
| **Authentification** | **EmployeurToken** : `Authorization: Bearer <token_employeur>` |

**`:id`** = identifiant de la **déclaration** (cotisation_employeur). Même id que pour la liste **GET /list** et que pour **GET /get_declaration_to_excel/:id**.

---

## 2. Objectif

- Récupérer **une déclaration** par son **id** pour l’employeur connecté.
- Charger les **lignes de déclaration** (declarations_employes) avec les infos **employé** (matricule, no_immatriculation, first_name, last_name).
- Construire les mêmes données que pour l’export Excel (matricule, no_immatriculation, first_name, last_name, salary_brut, ssc, cotisation_emplyeur, cotisation_employe).
- Appeler **generelistDeclaration** (utility3) qui génère un **PDF** à partir de ces données + infos employeur + période et année.
- Retourner le **buffer PDF** en **200**. Le backend ne renvoie pas d’en-tête `Content-Disposition` : le front peut proposer un nom du type `declaration_<periode>_<year>.pdf`.

---

## 3. Requête

- **GET** avec **Authorization: Bearer &lt;token&gt;**.
- **Paramètre de route** : **`id`** = id de la déclaration (cotisation_employeur).

**Exemple :**

```
GET /api/v1/cotisation_employeur/get_declaration_pdf/42
Authorization: Bearer <token_employeur>
```

---

## 4. Réponses

### 4.1 Succès (200)

- **Body** : contenu **binaire** du fichier **PDF**.
- Le front doit traiter la réponse en **blob** / **arraybuffer** et déclencher un téléchargement (ou affichage dans un nouvel onglet) avec un nom de fichier (ex. `declaration_JANVIER_2025.pdf`).

### 4.2 Déclaration introuvable (404)

- **Body JSON** : `{ "message": "Déclaration introuvable" }`.

### 4.3 Erreur (400)

- **Body JSON** : `{ "message": "Erreur" }` (ex. échec de la génération PDF).

### 4.4 Erreur (401)

- Token manquant, invalide ou expiré.

---

## 5. Contenu du PDF

Le PDF est généré par **generelistDeclaration** (utility3) : mise en page type « liste de déclaration » avec en-tête (logo, infos employeur), période et année, et un tableau des lignes (matricule, N° immatriculation, prénom, nom, salaire brut, salaire soumis à cotisation, part employeur, part employé).

---

## 6. Comportement du front

1. **Récupérer l’id** de la déclaration (depuis **GET /list**, champ **`id`**).
2. **Appel** : `GET /api/v1/cotisation_employeur/get_declaration_pdf/<id>` avec **Authorization: Bearer &lt;token&gt;**.
3. **Réponse 200** : traiter le body en **blob** (type `application/pdf` si le backend le définit, sinon binaire). Proposer le **téléchargement** avec un nom (ex. `declaration_<periode>_<year>.pdf`) ou ouvrir dans un nouvel onglet pour affichage.
4. **404** : afficher « Déclaration introuvable ».
5. **400** : afficher le **message** (ex. « Erreur »).
6. **401** : gérer la session (reconnexion, token).

---

## 7. Différence avec get_declaration_to_excel

| Route | Format | Usage |
|-------|--------|--------|
| **GET /get_declaration_to_excel/:id** | **Excel** (.xlsx) | Téléchargement pour réutilisation / édition des données. |
| **GET /get_declaration_pdf/:id** | **PDF** | Téléchargement ou affichage pour lecture / impression. |

Même **id** (déclaration), mêmes données exportées ; seul le format (Excel vs PDF) change.

---

## 8. Récapitulatif

| Élément | Détail |
|--------|--------|
| **Usage** | Exporter en **PDF** le détail d’**une** déclaration (liste des employés déclarés + salaires et cotisations). |
| **Id** | Id de la **déclaration** (cotisation_employeur). |
| **Réponse 200** | Fichier PDF binaire ; le front gère le téléchargement et le nom du fichier. |
| **Erreurs** | 404 (déclaration introuvable), 400 (erreur génération), 401 (token). |

Cette route sert à **télécharger ou afficher le PDF d’une déclaration** (vue Consultation : bouton « Exporter en PDF » ou « Voir PDF » sur une ligne).
