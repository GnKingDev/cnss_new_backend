# Menu Fiche Employé — Documentation

Ce document décrit en détail le menu **Fiche Employé** du tableau de bord : routes, composants et flux utilisateur.

---

## 1. Vue d’ensemble

Le menu **Fiche Employé** permet de :
- Consulter la liste des employés de l’entreprise (avec stats : total, actifs, inactifs, masse salariale).
- Voir le détail d’un employé (modal ou page dédiée).
- Modifier les informations d’un employé.
- Enregistrer une sortie (démission, retraite, etc.) et marquer l’employé comme inactif.
- Accéder à la fiche détaillée d’un employé (page plein écran) avec les onglets **Famille**, **Cotisations**, **Relevé de carrière** et **Prestations**.
- Consulter la **Famille** (conjoints, enfants, parents), l’**historique des Cotisations** (5% salariale, 18% patronale), le **Relevé de carrière** (par employeur, avec détail par employeur), et la **Situation des Prestations** (actives, demandes en cours, éligibilité).

**Libellés i18n :**
- `nav.ficheEmploye` : "Fiche Employé" (FR), "Employee Card" (EN), "员工档案" (ZH).

---

## 2. Routes (React Router)

| Route | Composant | Description |
|-------|-----------|-------------|
| `/fiche-employe` | `FicheEmploye` | Liste des employés + cartes de stats + modals (détail, édition, sortie). |
| `/fiche-employe/:id` | `EmployeeDetail` | Fiche détaillée plein écran d’un employé (profil, famille, carrière, cotisations, etc.). |
| `/fiche-employe/:employeeId/career/:employerId` | `EmployerCareerDetail` | Détail d’un épisode de carrière chez un employeur (postes, cotisations). |

**Fichiers :**
- `src/App.tsx` : déclaration des routes.
- `src/components/layout/Sidebar.tsx` : lien menu `{ titleKey: "nav.ficheEmploye", href: "/fiche-employe", icon: UserCheck }`.

---

## 3. Page liste : `/fiche-employe` (`FicheEmploye.tsx`)

### 3.1 Structure

- **En-tête** : `PageHeader` (icône UserCheck, badge "Gestion des Fiches", titre "Fiche Employé").
- **Cartes de statistiques** (4) :
  - Total Employés
  - Actifs (status === "validated")
  - Inactifs (status === "pending")
  - Masse Salariale (somme des salaires bruts, affichée en millions GNF).
- **Liste** : composant `EmployeeListSection` (tableau avec recherche, filtre par statut, pagination).
- **Modals** :
  - `EmployeeDetailModal` : consultation rapide.
  - `EmployeeEditModal` : modification des champs employé.
  - `EmployeeExitModal` : enregistrement d’une sortie (date, motif, préavis, notes).

### 3.2 Données

- Les employés sont gérés en state local `employees`. La liste et les stats (total, actifs, inactifs, masse salariale) sont dérivées de ce state.

### 3.3 Handlers

- `handleViewDetails(employee)` : ouvre le modal détail avec `selectedEmployee`.
- `handleEdit(employee)` : ouvre le modal d’édition.
- `handleEditFromDetail()` : ferme le modal détail et ouvre le modal édition.
- `handleSaveEmployee(updatedEmployee)` : met à jour l’employé dans le state (remplace l’entrée par `id`).
- `handleRemoveEmployee()` : ferme le détail et ouvre le modal sortie.
- `handleConfirmExit(exitData)` : met le statut de l’employé à `"pending"` (inactif) et enregistre les données de sortie.

### 3.4 Composant liste utilisé : `EmployeeListSection` (immatriculation)

- **Fichier** : `src/components/immatriculation/EmployeeListSection.tsx`.
- **Props** : `employees`, `onViewDetails`, `onEdit`.
- **Fonctionnalités** :
  - Recherche (prénom, nom, id, numéro de sécu, poste).
  - Filtre par statut (Tous / Validé / En attente).
  - Pagination (6 éléments par page).
  - Colonnes : Avatar, Nom, N° Sécu, Poste, Statut, Date embauche, Salaire, Actions (Détails, Editer).
- **Navigation** : le bouton "Détails" fait `navigate(\`/fiche-employe/${employee.id}\`)` vers la page `EmployeeDetail`.

---

## 4. Type `Employee` (UI)

Défini dans `src/components/immatriculation/EmployeeDetailModal.tsx` :

```ts
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  socialNumber: string;
  position: string;
  status: string;           // "validated" | "pending"
  photo?: string;
  gender?: string;
  birthDate?: string;
  birthPlace?: string;
  birthPrefecture?: string;
  nationality?: string;
  maritalStatus?: string;
  hireDate?: string;
  registrationDate?: string;
  firstHireDate?: string;
  grossSalary?: string;
  address?: string;
  email?: string;
  phone?: string;
  fatherFirstName?: string;
  fatherLastName?: string;
  motherFirstName?: string;
  motherLastName?: string;
}
```

Ce type est utilisé par les modals (détail, édition, sortie) et par la liste. Il est en **camelCase** (côté UI).

---

## 5. Page fiche détaillée : `/fiche-employe/:id` (`EmployeeDetail.tsx`)

### 5.1 Contenu

- Bouton **Retour** vers `/fiche-employe`.
- **En-tête** : avatar, nom/prénom, poste, N° assuré, badge statut (Validé / En attente), boutons (Exporter PDF, Modifier, Déclarer sortie).
- **Quick stats** (sous l’en-tête) : quatre indicateurs affichés en bandeau :
  - **Mois cotisés** (nombre total de mois cotisés)
  - **Total cotisations** (montant total des cotisations, ex. "227,700,000 GNF")
  - **Enfants déclarés** (nombre d’enfants à charge déclarés)
  - **Années de carrière** (nombre d’années de carrière)
- **Onglets** (Tabs) : Informations, Carte, **Famille**, **Cotisations**, **Relevé de carrière**, **Prestations** (voir § 5.5).
- **Modal sortie** : `EmployeeExitModal` avec les mêmes champs que sur la page liste (date sortie, dernier jour, motif, préavis, notes).

### 5.2 Données requises du backend pour les Quick stats

Pour que les quatre indicateurs du bandeau (Mois cotisés, Total cotisations, Enfants déclarés, Années de carrière) s’affichent et ne restent pas à « — », **le backend doit fournir** ces champs. Ils peuvent être renvoyés soit dans la réponse de **GET** `/api/v1/employe/:id`, soit dans un résumé dédié (ex. GET `/api/v1/employe/:id/summary`). Exemple de champs attendus (snake_case ou camelCase selon convention API) :

| Libellé affiché   | Champ attendu (ex.)   | Type / Exemple                          |
|-------------------|-----------------------|-----------------------------------------|
| Mois cotisés      | `total_mois_cotises`  | number (ex. 396)                        |
| Total cotisations | `total_cotisations`   | string ou number (ex. "227,700,000 GNF")|
| Enfants déclarés  | `enfants_declares`    | number (ex. 5)                          |
| Années de carrière| `annees_carriere`     | number (ex. 33)                         |

Sans ces données côté backend, le front affiche « — » pour ces quatre indicateurs.

### 5.3 Données

- L’employé affiché est chargé à partir de l’`id` dans l’URL (`useParams().id`). Les onglets Famille, Cotisations, Relevé de carrière et Prestations utilisent les données associées à cet employé.

### 5.4 Navigation

- Retour liste : `navigate("/fiche-employe")`.
- Détail carrière : `navigate(\`/fiche-employe/${id}/career/${career.id}\`)`.

### 5.5 Onglets de la fiche détaillée : Famille, Cotisations, Relevé de carrière, Prestations

Sur la page `/fiche-employe/:id` (`EmployeeDetail.tsx`), six onglets sont affichés. Voici le détail des quatre qui concernent **Famille**, **Cotisations**, **Relevé de carrière** et **Prestations**.

---

#### Famille (onglet `family`)

- **Composant** : `FamilyManagement` (`src/components/immatriculation/FamilyManagement.tsx`).
- **Prop** : `employeeLastName` (nom de famille de l’employé pour les enfants).
- **Contenu** :
  - **Conjoint(s)** : liste des conjoints avec nom, prénom, date/lieu de naissance, profession, type d’union (mariage / concubinage), date d’union, statut (actif / divorcé / décédé), certificat de mariage (upload). Chaque conjoint peut avoir des **enfants** rattachés.
  - **Enfants** : par conjoint, liste des enfants (nom, prénom, date/lieu de naissance, sexe, statut : à charge / majeur / décédé).
  - **Parents** : père et mère de l’assuré (nom, prénom, date de naissance, statut : vivant / décédé).
- **Données** : structure `FamilyData` (spouses[], parents: { father, mother }). Props optionnelles : `initialData`, `onSave` pour l’initialisation et la persistance.

---

#### Cotisations (onglet `contributions`)

- **Titre** : « Historique des Cotisations ».
- **Résumé** (en haut) : Total mois cotisés, Total cotisations, Période (ex. 1992 - 2024), Dernière cotisation (ex. Décembre 2024).
- **Tableau** : une ligne par période (mois/année), colonnes :
  - Période  
  - Salaire Brut  
  - Cot. Salariale (5%)  
  - Cot. Patronale (18%)  
  - Total  
  - Statut (Payé / En attente)
- **Actions** : menu Télécharger (PDF, Excel, CSV) et Imprimer (`handleExport`, `handlePrint`).
- **Données** : tableau par période (periode, salaireBrut, cotisationSalariale, cotisationPatronale, total, statut). Taux affichés : 5% salariale + 18% patronale = 23% total.

---

#### Relevé de carrière (onglet `career`)

- **Titre** : « Relevé de Carrière ».
- **Résumé** (bandeau) : nombre d’employeurs, total mois cotisés, total Cot. Salariale (5%), total Cot. Patronale (18%).
- **Tableau** : une ligne par **employeur**, colonnes :
  - Employeur (nom, N° employeur, adresse)
  - Période (date début → date fin)
  - Mois cotisés
  - Total Salaire Brut
  - Cot. Salariale (5%)
  - Cot. Patronale (18%)
  - Total Cotisations
  - Statut (Actif / Terminé)
  - **Actions** : bouton « Détail » → `navigate(\`/fiche-employe/${id}/career/${career.id}\`)`
- **Ligne de totaux** en bas du tableau (mois, salaire brut total, cotisations).
- **Note** : rappel des taux 5% / 18% / 23% et renvoi vers l’onglet « Cotisations » pour l’historique détaillé.
- **Actions** : Télécharger (PDF, Excel, CSV), Imprimer.
- **Données** : tableau d’épisodes par employeur (id, employeur, numeroEmployeur, adresse, secteurActivite, dateDebut, dateFin, moisCotises, totalSalaireBrut, cotisationSalariale, cotisationPatronale, totalCotisations, statut, postes[]). Chaque `postes[]` contient titre, dates, durée, salaire brut, département, type de contrat, responsabilités (utilisé sur la page `EmployerCareerDetail`).

---

#### Prestations (onglet `benefits`)

- **Bloc 1 – Prestations actives**  
  - Liste des prestations en cours : type, description, statut (En cours / Actif), date début, montant, bénéficiaires.  
  - Actions : Télécharger (PDF, Excel, CSV), Imprimer.

- **Bloc 2 – Demandes en cours**  
  - Liste des demandes non encore liquidées : type (ex. Demande de Retraite), référence, date de dépôt, statut (ex. En cours).  
  - Si vide : message « Aucune demande en cours ».

- **Bloc 3 – Éligibilité aux prestations**  
  - Cartes par type de prestation (ex. Pension de Retraite, Allocations Familiales) avec badge (Éligible / Active) et critères (âge, mois cotisés, enfants à charge, cotisations à jour, etc.).

Le composant `EmployeeCard` (prestations) est utilisé ailleurs sur la fiche pour le lien vers les demandes ; l’onglet Prestations regroupe la **situation des prestations** (actives, en cours, éligibilité).

---

## 6. Page détail carrière : `/fiche-employe/:employeeId/career/:employerId` (`EmployerCareerDetail.tsx`)

### 6.1 Contenu

- Bouton retour (vers la fiche employé ou la liste).
- En-tête employeur : nom, N° employeur, adresse, secteur, dates de début/fin, mois cotisés, totaux salaire/cotisations, statut.
- **Liste des postes** chez cet employeur : titre, dates, durée, salaire brut, département, type de contrat, responsabilités.

### 6.2 Données

- **Mock** : `mockCareerHistory` (tableau d’épisodes employeur avec tableaux de postes). Les paramètres `employeeId` et `employerId` de l’URL ne sont pas utilisés pour un chargement API.

---

## 7. Routes API backend — liste complète et formats de réponse

Toutes les routes ci‑dessous (sauf mention) sont protégées par **Authorization: Bearer &lt;token&gt;** (token employeur). En cas d’erreur, le backend renvoie en général un JSON avec `{ "message": "..." }` et un code HTTP 4xx/5xx.

---

### 7.1 Base employé : `/api/v1/employe` (existantes)

Utilisées par **Immatriculation** et par **EmployeeListSectionModal** ; la page Fiche Employé peut s’appuyer sur **stats** et **list** pour la liste.

| Méthode | Route | Description |
|--------|--------|-------------|
| GET | `/api/v1/employe/stats` | Statistiques employés. |
| GET | `/api/v1/employe/list` | Liste paginée avec recherche. |
| POST | `/api/v1/employe/verify_employe` | Vérifier un employé déjà immatriculé (ajout existant). |
| POST | `/api/v1/employe/save_employe_verify` | Vérifier email/téléphone avant création. |
| POST | `/api/v1/employe/save_employe` | Créer un employé (multipart). |
| POST | `/api/v1/employe/import_excel` | Import Excel (non immatriculés). |
| POST | `/api/v1/employe/import_excel_adhesion` | Import Excel (adhesion, déjà immatriculés). |

---

#### GET `/api/v1/employe/stats`

- **Query** : aucune.
- **Réponse 200** :
```json
{
  "total": 120,
  "immatricules": 115,
  "nonImmatricules": 5
}
```
- **Erreur** : 401 si token invalide ; body `{ "message": "..." }`.

---

#### GET `/api/v1/employe/list`

- **Query** :
  - `page` (number, défaut 1)
  - `limit` (number, défaut 50)
  - `search` (string, optionnel) : recherche globale (matricule, nom, prénom, immatriculation, téléphone). Si présent, les autres critères sont ignorés.
  - Sinon : `matricule`, `nom`, `prenom`, `immatriculation`, `telephone` (optionnels).
- **Réponse 200** :
```json
{
  "data": [
    {
      "id": 1,
      "first_name": "Mohamed Lamine",
      "last_name": "COUMBASSA",
      "no_immatriculation": "161040097976",
      "matricule": null,
      "fonction": "Ex-DGA",
      "is_out": false,
      "salary": 2500000,
      "date_of_birth": "1961-10-11T00:00:00.000Z",
      "place_of_birth": "Conakry",
      "nationality": "GUINEENNE",
      "worked_date": "1992-01-01T00:00:00.000Z",
      "immatriculation_date": "1992-01-01T00:00:00.000Z",
      "phone_number": "+224622000000",
      "email": "m.coumbassa@email.com",
      "adress": "Quartier Almamya, Conakry",
      "avatar": null,
      "gender": "M",
      "situation_matrimoniale": "Marié",
      "father_first_name": "Mamadou",
      "father_last_name": "COUMBASSA",
      "mother_first_name": "Fatoumata",
      "mother_last_name": "DIALLO",
      "ville": "Conakry",
      "type_contrat": "CDI",
      "employeurId": 1,
      "prefectureId": 1,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "pagination": {
    "total": 120,
    "page": 1,
    "limit": 50
  }
}
```
- **Modèle Employe** complet : `src/types/employe.ts` (snake_case). Les dates en ISO string.
- **Erreur** : 401 ; body `{ "message": "..." }`.

---

#### POST `/api/v1/employe/verify_employe`

- **Body** : `{ "code": "161040097976" }` (numéro d’immatriculation).
- **Réponse 200** : objet **Employe** (snake_case) si l’employé est trouvé et libre (is_out: true) ou créé depuis ancienne DB.
- **Réponse 400** : `{ "message": "Code manquant" }` ou employé pas libre / non trouvé.

---

#### POST `/api/v1/employe/save_employe_verify`

- **Body** : `{ "data": { "email": "...", "phone_number": "..." } }`.
- **Réponse 200** : body vide ou `{}` si email/téléphone disponibles.
- **Réponse 400** : `{ "message": "..." }` si déjà utilisés.

---

#### POST `/api/v1/employe/save_employe`

- **Content-Type** : `multipart/form-data`.
- **Champs** : `employe` (JSON string, payload snake_case), `cni` (fichier), `contrat_file` (fichier), `avatar` (fichier).
- **Réponse 200** : objet **Employe** créé.
- **Réponse 400** : fichier manquant ou erreur de validation ; `{ "message": "..." }`.

---

#### POST `/api/v1/employe/import_excel` et `import_excel_adhesion`

- **Body** : `multipart/form-data`, champ `excel` = fichier .xlsx.
- **Réponse 200** :
```json
{ "success": true, "message": "...", "count": 15 }
```
- **Réponse 400** :
```json
{
  "success": false,
  "message": "...",
  "errors": [
    { "row": 2, "field": "email", "message": "..." }
  ],
  "errorsText": "optionnel résumé texte"
}
```

---

### 7.2 Routes à implémenter pour la Fiche Employé

Ces routes ne sont pas encore appelées par le front ; les écrans utilisent des mocks. Formats proposés pour que le backend renvoie ce que le front attend.

**Règle métier — Mois de cotisation** : partout où un **mois de cotisation** (ou **total_mois_cotises**, **mois_cotises**) est calculé, **seules les périodes pour lesquelles la cotisation est payée** sont comptées (cotisation employeur avec `is_paid === true`). Une déclaration non payée n’entre pas dans le décompte des mois cotisés.

---

#### GET `/api/v1/employe/:id` — Détail d’un employé

- **Usage** : page `/fiche-employe/:id`, modals détail/édition, et **quick stats** du bandeau (Mois cotisés, Total cotisations, Enfants déclarés, Années de carrière).
- **Réponse 200** : un objet **Employe** (snake_case), même structure que dans `list` (éventuellement avec `prefecture`, `employeur` inclus), **plus les champs** :
  - `avatar` (string) : chemin relatif de la photo (ex. `uploads/user.jpeg`).
  - `avatar_url` (string) : URL pour affichage (ex. `/uploads/xxx.jpg`). Les fichiers sont servis en GET sous `/uploads/...`.
  - `total_mois_cotises`, `total_cotisations`, `enfants_declares`, `annees_carriere` (voir quick stats).
- Un **console.log** `[EMPLOYE_GET_ID] response stats` affiche les stats à chaque appel (pour debug).
- **Réponse 404** : `{ "message": "Employé non trouvé" }`.

---

#### PATCH `/api/v1/employe/:id/avatar` — Mise à jour de la photo

- **Content-Type** : `multipart/form-data`.
- **Champ** : `avatar` ou `photo` (fichier image).
- **Auth** : token employeur. L’employé doit appartenir à l’employeur.
- **Réponse 200** : objet employé mis à jour avec `avatar` (chemin relatif) et `avatar_url` (URL d’affichage, ex. `/uploads/xxx.jpg`).
- **Réponse 400** : `{ "message": "Fichier requis (champ avatar ou photo en multipart/form-data)" }` si aucun fichier.

#### PATCH `/api/v1/employe/:id` — Mise à jour (édition)

- **Body** : champs modifiables en snake_case (ex. `first_name`, `last_name`, `email`, `phone_number`, `fonction`, `adress`, `date_of_birth`, `place_of_birth`, etc.). Pas de multipart obligatoire si pas de changement de fichiers.
- **Réponse 200** : objet **Employe** mis à jour.
- **Réponse 400** : validation ; `{ "message": "..." }`.
- **Réponse 404** : employé inexistant.

---

#### POST `/api/v1/employe/:id/sortie` (ou équivalent) — Déclarer une sortie

- **Body** suggéré :
```json
{
  "out_date": "2025-02-01",
  "last_work_day": "2025-01-31",
  "exit_reason": "retraite",
  "notice_period": "3_months",
  "notes": "..."
}
```
- **Réponse 200** : objet **Employe** avec `is_out: true`, `out_date` renseigné.
- **Réponse 400** : `{ "message": "..." }`.

---

#### GET `/api/v1/employe/:id/famille` — Famille (conjoints, enfants, parents)

- **Usage** : onglet Famille de la fiche employé.
- **Réponse 200** suggérée :
```json
{
  "spouses": [
    {
      "id": "uuid ou number",
      "nom": "COUMBASSA",
      "prenom": "Mariama",
      "date_naissance": "1965-03-15",
      "lieu_naissance": "Kindia",
      "profession": "Enseignante",
      "type_union": "mariage",
      "date_union": "1988-06-01",
      "statut": "actif",
      "certificat_mariage": "url ou null",
      "children": [
        {
          "id": "uuid",
          "nom": "COUMBASSA",
          "prenom": "Abdoulaye",
          "date_naissance": "1990-05-12",
          "lieu_naissance": "Conakry",
          "sexe": "M",
          "statut": "majeur"
        }
      ]
    }
  ],
  "parents": {
    "father": { "nom": "COUMBASSA", "prenom": "Mamadou", "date_naissance": "1935", "statut": "decede" },
    "mother": { "nom": "DIALLO", "prenom": "Fatoumata", "date_naissance": "1940", "statut": "vivant" }
  }
}
```
- Chaque conjoint et enfant inclut **`statut_dossier`** : `"en_cours_validation"` | `"valide"` | `"supprime"`. Seuls les conjoints et enfants dont `statut_dossier` ≠ `supprime` sont retournés.
- Chaque enfant inclut **`spouse_id`** (id du conjoint parent).
- **Réponse 404** : `{ "message": "Employé non trouvé" }`.

#### PATCH `/api/v1/employe/:id/famille` — Mise à jour famille (multipart ou JSON)

- **Usage** : enregistrement des ajouts, modifications et suppressions depuis l’onglet Famille (Option A).
- **Deux modes acceptés** :
  1. **multipart/form-data** (recommandé si photos/fichiers) : champ **`famille`** (JSON stringifié) + champs **fichiers** (un par photo/extrait). Tous les fichiers sont enregistrés dans **`uploads/`** (même dossier que la photo de profil employé), servis sous `/uploads/...`.
  2. **JSON** : body `{ spouses, parents }` sans fichiers ; pour conserver un fichier déjà enregistré, envoyer le chemin renvoyé par le backend (ex. `"/uploads/xxx.jpeg"`). Ne pas envoyer de placeholders (`/enfant/user.jpeg`, `/enfant/user.pdf`) : le backend les rejette et enregistre `null`.
- **Noms des champs FormData (multipart)** — `<spouseId>` / `<childId>` = **`id`** du conjoint/enfant dans le JSON `famille` :
  - `famille` (string) : JSON stringifié `{ spouses, parents }`.
  - `photo_conjoint_<spouseId>`, `certificat_mariage_<spouseId>` : fichiers conjoint.
  - `photo_enfant_<childId>`, `extrait_enfant_<childId>` : fichiers enfant.
  - Exemples : `photo_conjoint_42`, `certificat_mariage_sp1737123456789`, `photo_enfant_sp1737123456790_1`. Un fichier par champ. Tous enregistrés dans **`uploads/`** (servis en `/uploads/...`). Ne pas mettre de placeholders (`/enfant/user.jpeg`, etc.) dans le JSON : le backend les ignore.
- **Statut dossier** : chaque conjoint et enfant a **`statut_dossier`** : `"en_cours_validation"` | `"valide"` | `"supprime"`. Conjoint absent de la liste = marqué `supprime` (soft delete).
- **GET** : `spouses[].photo` et `children[].photo` sont des **URLs** (ex. `/uploads/xxx`). `children[].extrait_naissance` idem.
- **Réponse 200** : objet famille complet (même format que GET). **400** : body invalide. **404** : employé non trouvé.

---

#### GET `/api/v1/employe/:id/cotisations` — Historique des cotisations

- **Usage** : onglet Cotisations (tableau paginé, 10 lignes par page côté front).
- **Règle métier** : **un mois de cotisation compte uniquement lorsque la cotisation est payée** (cotisation employeur `is_paid === true`). Les indicateurs `total_mois_cotises`, `derniere_cotisation` et les totaux du summary ne prennent en compte que les périodes payées.
- **Query** optionnelles :
  - `page` : numéro de page (à partir de 1, défaut 1).
  - `limit` : nombre d’éléments par page (ex. 10, défaut 10, max 100).
- Exemple : `GET /api/v1/employe/123/cotisations?page=1&limit=10`.
- **Réponse 200** : `summary` (inchangé), `data` (lignes de la page demandée uniquement), `pagination` : `{ total, page, limit }`.
```json
{
  "summary": {
    "total_mois_cotises": 396,
    "total_cotisations": "227,700,000 GNF",
    "periode_debut": "1992",
    "periode_fin": "2024",
    "derniere_cotisation": "Décembre 2024"
  },
  "data": [
    {
      "periode": "Janvier 2024",
      "salaire_brut": 2500000,
      "cotisation_salariale": 125000,
      "cotisation_patronale": 450000,
      "total": 575000,
      "statut": "paye"
    }
  ],
  "pagination": { "total": 396, "page": 1, "limit": 10 }
}
```
- Taux affichés côté front : 5% salariale, 18% patronale, 23% total.

---

#### GET `/api/v1/employe/:id/career` — Relevé de carrière (par employeur)

- **Usage** : onglet Relevé de carrière.
- **Règle métier** : **un mois de cotisation compte uniquement lorsque la cotisation est payée** (`CotisationEmployeur.is_paid === true`). Les champs `mois_cotises` (par employeur) et `total_mois_cotises` (summary) ne comptent que les déclarations dont la cotisation employeur est payée.
- **Réponse 200** suggérée :
```json
{
  "summary": {
    "nombre_employeurs": 3,
    "total_mois_cotises": 532,
    "total_cotisation_salariale": 41010000,
    "total_cotisation_patronale": 147636000
  },
  "data": [
    {
      "id": 1,
      "employeur": "CNSS GUINÉE",
      "numero_employeur": "8204000010400",
      "adresse": "Conakry, Kaloum",
      "secteur_activite": "Administration Publique",
      "date_debut": "1992-01-01",
      "date_fin": null,
      "date_fin_label": "En cours",
      "mois_cotises": 396,
      "total_salaire_brut": "750000000",
      "cotisation_salariale": "37500000",
      "cotisation_patronale": "135000000",
      "total_cotisations": "172500000",
      "statut": "actif",
      "postes": [
        {
          "id": "p1",
          "titre": "Directeur Général Adjoint",
          "date_debut": "2018-01-01",
          "date_fin": null,
          "duree": "7 ans",
          "salaire_brut": "2500000",
          "departement": "Direction Générale",
          "type_contrat": "CDI",
          "responsabilites": "..."
        }
      ]
    }
  ]
}
```
- Pour le détail d’un épisode : **GET** `/api/v1/employe/:employeeId/career/:employerId` peut renvoyer un seul élément du tableau `data` avec son `postes[]` détaillé. **Implémenté.** Liste : `GET /api/v1/employe/123/career` ; détail (avec tableau `cotisations`) : `GET /api/v1/employe/123/career/456`.

---

#### GET `/api/v1/employe/:id/prestations` — Situation des prestations

- **Usage** : onglet Prestations (actives, demandes en cours, éligibilité).
- **Réponse 200** suggérée :
```json
{
  "actives": [
    {
      "id": "1",
      "type": "Allocations Familiales",
      "statut": "En cours",
      "date_debut": "2010-01-01",
      "montant": "50,000 GNF/mois",
      "beneficiaires": "2 enfants",
      "description": "Allocations pour enfants à charge"
    },
    {
      "id": "2",
      "type": "Assurance Maladie",
      "statut": "Actif",
      "date_debut": "1992-01-01",
      "montant": "Couverture 80%",
      "beneficiaires": "Famille",
      "description": "Couverture maladie pour l'assuré et sa famille"
    }
  ],
  "demandes_en_cours": [
    {
      "id": "1",
      "type": "Demande de Retraite",
      "reference": "PEN-2025-00001",
      "date_depot": "2025-01-15",
      "statut": "En cours"
    }
  ],
  "eligibilite": [
    {
      "prestation": "Pension de Retraite",
      "eligible": true,
      "critères": ["Âge: 63 ans (min. 55 ans)", "Cotisations: 396 mois (min. 180 mois)"]
    },
    {
      "prestation": "Allocations Familiales",
      "eligible": true,
      "statut": "Active",
      "critères": ["Enfants à charge: 1", "Cotisations à jour"]
    }
  ]
}
```

---

#### Carte d'assuré (onglet Carte)

- **GET** `/api/v1/employe/:id/card/pdf` — Télécharger la carte (PDF binaire).  
  - **Réponse 200** : corps = fichier PDF (buffer). Headers : `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="carte-assure-{nom}.pdf"`.  
  - **404** : employé non trouvé.  
  - Design : dégradé vert eCNSS, chip, photo (avatar), nom, prénom, N° assuré formaté, date d’émission (immatriculation_date ou worked_date).

- **POST** `/api/v1/employe/:id/card/send-email` — Envoyer la carte par email.  
  - **Body (JSON)** optionnel : `{ "email": "destinataire@exemple.com" }`. Si absent, envoi à l’email de l’employé.  
  - **Réponse 200** : `{ "message": "Carte envoyée avec succès", "sent_to": "..." }`.  
  - **400** : email manquant ou invalide (et employé sans email). **503** si envoi d’email non configuré.

- **GET** `/api/v1/employe/:id/card` — Métadonnées de la carte (affichage « Carte à jour »).  
  - **Réponse 200** : `statut_carte` (active | inactive), `date_emission`, `date_validite_carte`, `type_assure`, `employeur_actuel`, `no_immatriculation`.

---

### 7.3 Résumé : routes existantes vs à implémenter

| Route | Méthode | Existe ? | Utilisée par Fiche Employé |
|-------|---------|----------|----------------------------|
| `/api/v1/employe/stats` | GET | Oui | Oui (via EmployeeListSectionModal si branché) |
| `/api/v1/employe/list` | GET | Oui | Oui (idem) |
| `/api/v1/employe/verify_employe` | POST | Oui | Non (Immatriculation) |
| `/api/v1/employe/save_employe_verify` | POST | Oui | Non (Immatriculation) |
| `/api/v1/employe/save_employe` | POST | Oui | Non (Immatriculation) |
| `/api/v1/employe/import_excel` | POST | Oui | Non (Immatriculation) |
| `/api/v1/employe/import_excel_adhesion` | POST | Oui | Non (Immatriculation) |
| `/api/v1/employe/:id` | GET | À faire | Détail fiche, modals |
| `/api/v1/employe/:id` | PATCH | À faire | Modal édition |
| `/api/v1/employe/:id/sortie` | POST | À faire | Modal sortie |
| `/api/v1/employe/:id/famille` | GET | À faire | Onglet Famille |
| `/api/v1/employe/:id/cotisations` | GET | À faire | Onglet Cotisations |
| `/api/v1/employe/:id/career` | GET | À faire | Onglet Relevé de carrière |
| `/api/v1/employe/:employeeId/career/:employerId` | GET | À faire | Page détail carrière |
| `/api/v1/employe/:id/prestations` | GET | À faire | Onglet Prestations |
| `/api/v1/employe/:id/card/pdf` | GET | Implémenté | Télécharger carte (PDF binaire) |
| `/api/v1/employe/:id/card/send-email` | POST | Implémenté | Envoyer carte par email |
| `/api/v1/employe/:id/card` | GET | Implémenté | Métadonnées carte (statut, date émission) |

---

**Modèle backend** (`Employe`, snake_case) : voir `src/types/employe.ts` (id, first_name, last_name, no_immatriculation, matricule, fonction, is_out, salary, dates, etc.).

**Mapping** : `src/lib/employe-mapper.ts` — `employeToEmployee(e: Employe): Employee` convertit le modèle API en type UI `Employee` (camelCase, statut dérivé de `is_out`, dates formatées, salaire formaté en "X GNF").

---

## 8. Composants réutilisés (immatriculation)

| Composant | Fichier | Rôle |
|-----------|----------|------|
| `EmployeeDetailModal` | `immatriculation/EmployeeDetailModal.tsx` | Modal détail (header vert, infos en grille, boutons Modifier / Déclarer sortie). |
| `EmployeeEditModal` | `immatriculation/EmployeeEditModal.tsx` | Modal édition (formulaire pré-rempli, onSave met à jour l’employé en state). |
| `EmployeeExitModal` | `immatriculation/EmployeeExitModal.tsx` | Modal sortie (date, dernier jour, motif, préavis, notes) ; `onConfirm(exitData)`. |
| `EmployeeListSection` | `immatriculation/EmployeeListSection.tsx` | Table liste + recherche + filtre + pagination ; navigation "Détails" vers `/fiche-employe/:id`. |
| `FamilyManagement` | `immatriculation/FamilyManagement.tsx` | Gestion conjoint / enfants (utilisé dans EmployeeDetail). |

---

## 9. Composant Fiche Employé spécifique : `EmployeeListSectionModal`

- **Fichier** : `src/components/fiche-employe/EmployeeListSectionModal.tsx`.
- **Utilisation** : dans la page **Immatriculation** (onglet Consultation), pas dans la page Fiche Employé.
- **Données** : appelle `getEmployeStats(token)` et `getEmployeList(token, { page, limit, search })`, mappe les résultats avec `employeToEmployee`, affiche la liste avec pagination et filtre par statut.
- **Props** : `onViewDetails`, `onEdit` (pour ouvrir modals depuis la liste).

Pour brancher la **page Fiche Employé** sur l’API, on peut soit :
- Remplacer `EmployeeListSection` par `EmployeeListSectionModal` et adapter les callbacks, soit
- Garder `EmployeeListSection` et alimenter `employees` via `getEmployeList` + `employeToEmployee` dans `FicheEmploye` (useEffect + state).

---

## 10. Résumé des flux

1. **Liste** : utilisateur va sur `/fiche-employe` → voit stats + liste (mock) → peut Rechercher / Filtrer / Paginer.
2. **Détail en modal** : clic "Détails" ou "Voir" sur un ligne (selon composant) → ouvre `EmployeeDetailModal` → depuis le modal, "Modifier" → `EmployeeEditModal`, ou "Déclarer sortie" → `EmployeeExitModal`.
3. **Détail en page** : clic "Détails" dans `EmployeeListSection` → `navigate(/fiche-employe/:id)` → page `EmployeeDetail` (données mock).
4. **Carrière** : dans la fiche détail, onglet Carrière → clic "Détail" sur une ligne employeur → `navigate(/fiche-employe/:id/career/:employerId)` → page `EmployerCareerDetail` (mock).

---

## 11. Évolutions possibles (backend)

Toutes les routes à implémenter, avec les formats de requête et de réponse attendus, sont décrites dans la **section 7.2** et le **tableau récapitulatif 7.3**. En résumé :

- **GET** `/api/v1/employe/:id` : détail d’un employé (réponse = objet Employe).
- **PATCH** `/api/v1/employe/:id` : mise à jour des champs (body partiel snake_case, réponse = Employe).
- **POST** `/api/v1/employe/:id/sortie` (ou équivalent) : enregistrement de la sortie (body : out_date, last_work_day, exit_reason, notice_period, notes) ; réponse = Employe avec `is_out: true`.
- **GET** `/api/v1/employe/:id/famille` : conjoints (avec `children` et `spouse_id`), parents. **PATCH** `/api/v1/employe/:id/famille` : mise à jour famille (body complet).
- **GET** `/api/v1/employe/:id/cotisations` : historique des cotisations (summary + data par période).
- **GET** `/api/v1/employe/:id/career` : relevé de carrière par employeur (summary + data avec postes).
- **GET** `/api/v1/employe/:employeeId/career/:employerId` : détail d’un épisode employeur (un élément du relevé avec postes).
- **GET** `/api/v1/employe/:id/prestations` : prestations actives, demandes en cours, éligibilité.
- **GET** `/api/v1/employe/:id/card/pdf` : téléchargement de la carte d’assuré (PDF binaire).
- **POST** `/api/v1/employe/:id/card/send-email` : envoi de la carte par email (body optionnel `{ "email": "..." }`).
- **GET** `/api/v1/employe/:id/card` : métadonnées de la carte (statut, date d’émission, employeur actuel).

Une fois ces routes disponibles, brancher les appels depuis `FicheEmploye`, `EmployeeDetail` et `EmployerCareerDetail`, et remplacer les mocks par les réponses typées (ex. `Employe` + `employeToEmployee` ou types dédiés pour famille / cotisations / carrière / prestations).
