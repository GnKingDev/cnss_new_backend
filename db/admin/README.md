# Module Admin (portail BO)

Tout ce qui concerne les **utilisateurs admin** du back-office (BO) est regroupé dans ce dossier.

- **model.js** : modèle Sequelize `DirgaU`, table `dirgas` (agents admin / DIRGA).
- **route.js** : routes API sous `/api/v1/admin` et `/v1/admin` (login, get_current_user, recap, employeurs, employés, adhésion, etc.).
- **utility.js** : helpers (ex. `findByEmail`).
- **migrate.js** : synchronisation de la table (alter).

Le frontend BO (bo_cnss) appelle `/api/v1/admin/login` et `/api/v1/admin/get_current_user` pour l’authentification.
