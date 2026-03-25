# Liste des modèles (Sequelize) et attributs

Tous les modèles du projet avec fichier, table et attributs (type Sequelize). Les clés étrangères sont indiquées par `→ Model`.

---

## Activity  
**Fichier:** `db/domain_activite/activity.model.js` · **Table:** `activities`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| name | TEXT |
| code | TEXT |
| createdAt | DATE |
| updatedAt | DATE |

---

## Adhesion  
**Fichier:** `db/adhesion/model.js` · **Table:** `adhesions`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| first_name | STRING |
| last_name | STRING |
| raison_sociale | STRING |
| no_immatriculation | STRING (unique) |
| phone_number | STRING |
| email | STRING |
| address | STRING |
| effectif_femme | BIGINT (default 0) | 
| effectif_homme | BIGINT (default 0) |
| effectif_apprentis | BIGINT (default 0) |
| fax | STRING |
| no_dni | TEXT |
| no_rccm | TEXT |
| date_creation | DATE |
| date_first_embauche | DATE |
| main_activity | BIGINT |
| category | STRING |
| active_btn | BOOLEAN (default false) |
| who_valid | BIGINT |
| is_valid | BOOLEAN (default false) |
| valid_date | DATE |
| createdAt | DATE |
| updatedAt | DATE |

---

## AffiliationVolontaire  
**Fichier:** `db/affiliation-volontaire/model.js` · **Table:** `affiliation_volontaire`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| nom | STRING |
| prenom | STRING |
| date_naissance | DATE |
| lieu_naissance | STRING |
| sexe | STRING |
| adresse | STRING |
| phone_number | STRING (unique) |
| email | STRING (unique) |
| profession | STRING |
| cni_file_path | STRING |
| status | STRING (default 'Nouveau') |
| is_validated | BOOLEAN (default false) |
| validated_date | DATE |
| validated_by | INTEGER |
| is_risque_professionnel_active | BOOLEAN (default false) |
| risque_professionnel_percentage | FLOAT (default 0.04) |
| is_assurance_maladie_active | BOOLEAN (default false) |
| assurance_maladie_percentage | FLOAT (default 0.065) |
| is_vieillesse_active | BOOLEAN (default false) |
| vieillesse_percentage | FLOAT (default 0.065) |
| requester_picture | STRING |
| revenu_annuel | BIGINT (default 0) |
| revenu_mensuel | BIGINT (default 0) |
| plafond | BIGINT (default 0) |
| cotisation | BIGINT (default 0) |
| montant_trimestriel | BIGINT (default 0) |
| no_immatriculation | STRING (unique) |
| certificat_residence_file | STRING |
| brancheId | INTEGER → Branche |
| prefectureId | INTEGER → Prefecture |
| createdAt | DATE |
| updatedAt | DATE |

---

## Banque  
**Fichier:** `db/banques/model.js` · **Table:** `banques`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| name | STRING |
| collector_code | STRING |
| old_db_id | INTEGER |
| createdAt | DATE |
| updatedAt | DATE |

---

## Branche  
**Fichier:** `db/branches/branche.model.js` · **Table:** `branches`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| name | TEXT |
| code | TEXT |
| activityId | INTEGER → Activity |
| createdAt | DATE |
| updatedAt | DATE |
 
---

## Carer  
**Fichier:** `db/carriere/model.js` · **Table:** `carriers`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| date_entre | DATE |
| date_sortie | DATE |
| employeId | INTEGER → Employe |
| employeurId | INTEGER → Employeur |
| createdAt | DATE |
| updatedAt | DATE |

---

## Conjoint  
**Fichier:** `db/conjoint/model.js` · **Table:** `conjoints`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| first_name | STRING |
| last_name | STRING |
| date_of_birth | DATE |
| place_of_birth | STRING |
| date_mariage | DATE |
| code_conjoint | STRING |
| lieu_mariage | STRING |
| father_first_name | STRING |
| father_last_name | STRING |
| mother_first_name | STRING |
| mother_last_name | STRING |
| gender | STRING |
| profession | STRING |
| date_ajout | DATE |
| picture | STRING |
| civil_file | STRING |
| ordre | INTEGER |
| employeId | INTEGER → Employe |
| createdAt | DATE |
| updatedAt | DATE |

---

## CotisationEmployeur  
**Fichier:** `db/cotisation_employeur/model.js` · **Table:** `cotisation_employeurs`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| periode | STRING |
| trimestre | STRING |
| year | INTEGER |
| total_salary | BIGINT |
| total_salary_soumis_cotisation | BIGINT |
| total_cotisation_employe | BIGINT |
| total_cotisation_employeur | BIGINT |
| total_cotisation | BIGINT (default 0) |
| effectif_embauche | INTEGER |
| effectif_leave | INTEGER |
| current_effectif | INTEGER |
| facture_path | STRING |
| motif | STRING (default 'FACTURATION SUR PRINCIPAL') |
| prestation_familiale | BIGINT (default 0) |
| risque_professionnel | BIGINT (default 0) |
| assurance_maladie | BIGINT (default 0) |
| vieillesse | BIGINT (default 0) |
| total_branche | BIGINT |
| real_total_branche | BIGINT |
| quittance | STRING |
| is_paid | BOOLEAN (default false) |
| paid_date | DATE |
| debut_echeance_principal | DATE |
| fin_echeance_principal | DATE |
| is_penalite_applied | BOOLEAN (default false) |
| penelite_amount | BIGINT (default 0) |
| paid_by_us | BOOLEAN (default false) |
| is_degrade_mode | BOOLEAN (default false) |
| which_methode | STRING |
| is_insert_oldDB_debit | BOOLEAN (default false) |
| is_insert_oldDB_credit | BOOLEAN (default false) |
| employeurId | INTEGER → Employeur |
| userId | INTEGER → Users |
| createdAt | DATE |
| updatedAt | DATE |

---

## Demande  
**Fichier:** `db/demandes/model.js` · **Table:** `demandes`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| motif | STRING |
| response_date | DATE |
| status | STRING (default 'En cours de traitement') |
| dirga_traite | BOOLEAN (default false) |
| DG_traite | BOOLEAN (default false) |
| DG_reject_motif | TEXT |
| DG_response_date | DATE |
| response | BOOLEAN (default false) |
| send_rapport_date | DATE |
| resume_traitement | TEXT |
| motif_reject | TEXT |
| doc_path | STRING |
| rccm_file | STRING |
| nif_file | STRING |
| dsn_file | STRING |
| is_re_send | BOOLEAN (default false) |
| hide_re_send | BOOLEAN (default false) |
| quitus_path | STRING |
| reference | STRING (unique) |
| letter_file | STRING |
| priority | INTEGER (default 3) |
| is_delivred | BOOLEAN (default false) |
| date_delivry | DATE |
| quitus_expire_date | DATE |
| date_gen_quitus | DATE |
| last_quittance | STRING |
| is_send_to_dirga | BOOLEAN (default false) |
| rapport_file | STRING |
| employeurId | INTEGER → Employeur |
| userId | INTEGER → Users |
| dirgaId | INTEGER → DirgaU |
| createdAt | DATE |
| updatedAt | DATE |

---

## Demploye (déclaration employé)  
**Fichier:** `db/declaration-employe/model.js` · **Table:** `declaratio_employes`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| salary_brut | BIGINT |
| salary_soumis_cotisation | BIGINT |
| cotisation_employe | BIGINT |
| cotisation_emplyeur | BIGINT |
| total_cotisation | BIGINT (default 0) |
| periode | STRING |
| trimestre | STRING |
| year | INTEGER |
| employeId | INTEGER → Employe |
| employeurId | INTEGER → Employeur |
| cotisation_employeurId | INTEGER → CotisationEmployeur |
| createdAt | DATE |
| updatedAt | DATE |

---

## DirgaU  
**Fichier:** `db/admin/model.js` · **Table:** `dirgas`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| first_name | STRING |
| last_name | STRING |
| email | STRING |
| password | TEXT |
| can_work | BOOLEAN (default true) |
| type | STRING (default 'admin') |
| createdAt | DATE |
| updatedAt | DATE |

---

## Document  
**Fichier:** `db/document/model.js` · **Table:** `documents`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| name | STRING |
| path | STRING |
| code | STRING (default '') |
| employeurId | INTEGER → Employeur |
| createdAt | DATE |
| updatedAt | DATE |

---

## Employe  
**Fichier:** `db/employe/model.js` · **Table:** `employes`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| avatar | STRING (default 'uploads/user.jpeg') |
| first_name | STRING |
| last_name | STRING |
| phone_number | STRING (unique) |
| email | STRING (unique) |
| matricule | STRING |
| adress | STRING |
| gender | STRING |
| situation_matrimoniale | STRING |
| date_of_birth | DATE |
| place_of_birth | STRING |
| nationality | STRING |
| father_first_name | STRING |
| father_last_name | STRING |
| mother_first_name | STRING |
| mother_last_name | STRING |
| no_immatriculation | STRING (unique) |
| immatriculation_date | DATE |
| worked_date | DATE |
| salary | BIGINT |
| cni_file | STRING |
| type_contrat | STRING |
| contrat_file | STRING |
| is_imma | BOOLEAN (default false) |
| can_pay | BOOLEAN (default false) |
| is_out | BOOLEAN (default false) |
| ville | STRING |
| fonction | STRING |
| who_valid | INTEGER |
| out_date | DATE |
| request_can_pay | BOOLEAN (default false) |
| is_insert_oldDB | BOOLEAN (default false) |
| identity_number | STRING |
| is_adhesion | BOOLEAN (default false) |
| date_first_embauche | DATE |
| employeurId | INTEGER → Employeur |
| prefectureId | INTEGER → Prefecture |
| createdAt | DATE |
| updatedAt | DATE |

---

## Employeur  
**Fichier:** `db/XYemployeurs/model.js` · **Table:** `Employeurs`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| logo | TEXT (default '/uploads/user.png') |
| raison_sociale | STRING (unique) |
| category | TEXT (default 'E-20') |
| phone_number | STRING |
| email | STRING |
| adresse | TEXT |
| sigle | TEXT |
| solde | BIGINT (default 0) |
| salaire_initail | BIGINT (default 0) |
| effectif_femme | BIGINT (default 0) |
| effectif_homme | BIGINT (default 0) |
| effectif_apprentis | BIGINT (default 0) |
| effectif_total | BIGINT (default 0) |
| agence | TEXT |
| bp | TEXT |
| description | TEXT |
| fax | TEXT |
| portefeuille | BIGINT |
| no_immatriculation | TEXT |
| no_compte | TEXT |
| no_rccm | TEXT |
| rccm_file | TEXT |
| no_agrement | TEXT |
| no_dni | TEXT |
| dni_file | TEXT |
| secondary_activity | TEXT |
| date_immatriculation | DATE |
| date_first_embauche | DATE |
| chiffre_affaire_principale | DECIMAL |
| chiffre_affaire_secondaire | DECIMAL |
| date_creation | DATE |
| forme_juridique | TEXT |
| is_new_compamy | BOOLEAN (default true) |
| is_immatriculed | BOOLEAN (default false) |
| role | TEXT (default 'employeur') |
| number_employe | BIGINT (default 0) |
| who_valide | INTEGER |
| DPAE_file | STRING (default '') |
| is_insert_oldDB | BOOLEAN (default false) |
| is_principal | BOOLEAN (default true) |
| no_maison_mere | STRING |
| is_active | BOOLEAN (default true) |
| request_employeurId | INTEGER → RequestEmployeur |
| prefectureId | INTEGER → Prefecture |
| brancheId | INTEGER → Branche |
| createdAt | DATE |
| updatedAt | DATE |

---

## Enfant  
**Fichier:** `db/enfant/model.js` · **Table:** `enfants`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| first_name | STRING |
| last_name | STRING |
| date_of_birth | DATE |
| place_of_birth | STRING |
| gender | STRING |
| ordre | INTEGER |
| picture | STRING |
| extrait_file | STRING |
| date_ajout | DATE |
| code_conjoint | STRING |
| no_enfant | STRING |
| employeId | INTEGER → Employe |
| conjointId | INTEGER → Conjoint |
| createdAt | DATE |
| updatedAt | DATE |

---

## ExcelFile  
**Fichier:** `db/excel_file/model.js` · **Table:** `excelFiles`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| path | STRING |
| traite | BOOLEAN (default false) |
| employeurId | INTEGER → Employeur |
| demandeId | INTEGER → Demande |
| createdAt | DATE |
| updatedAt | DATE |

---

## Otp  
**Fichier:** `db/otp/model.js` · **Table:** `otps`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| code | STRING (unique) |
| can_use | BOOLEAN (default true) |
| userId | INTEGER → Users |
| createdAt | DATE |
| updatedAt | DATE |

---

## Paiement  
**Fichier:** `db/paiement/model.js` · **Table:** `paiements`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| status | STRING (default 'Nouveau') |
| is_paid | BOOLEAN (default false) |
| paid_date | DATE |
| paiement_date | DATE |
| invoiceId | STRING |
| merchantReference | STRING |
| who_paid | INTEGER |
| bank_name | STRING |
| paid_by_us | BOOLEAN (default false) |
| is_degrade_mode | BOOLEAN (default false) |
| which_methode | STRING |
| cotisation_employeurId | INTEGER → CotisationEmployeur |
| employeurId | INTEGER → Employeur |
| employeId | INTEGER → Employe |
| userId | INTEGER → Users |
| createdAt | DATE |
| updatedAt | DATE |

---

## Pays  
**Fichier:** `db/pays/pays.model.js` · **Table:** `pays`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| name | TEXT |
| code | TEXT |
| createdAt | DATE |
| updatedAt | DATE |

---

## Penalite  
**Fichier:** `db/penalites/model.js` · **Table:** `penalites`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| periode | STRING |
| montant | BIGINT |
| no_quittance | STRING |
| facturation_id | INTEGER |
| motif | STRING |
| encaissement_id | INTEGER |
| is_paid | BOOLEAN (default false) |
| merchantReference | STRING |
| invoiceId | STRING |
| status | STRING (default 'Nouveau') |
| data_penalite | DATE |
| is_insert_old_db | BOOLEAN (default false) |
| employeurId | INTEGER → Employeur |
| createdAt | DATE |
| updatedAt | DATE |

---

## Prefecture  
**Fichier:** `db/prefecture/model.js` · **Table:** `prefectures`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| name | TEXT |
| code | STRING (unique) |
| paysId | INTEGER → Pays |
| createdAt | DATE |
| updatedAt | DATE |

---

## Quittance  
**Fichier:** `db/quittance/model.js` · **Table:** `quittances`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| reference | STRING |
| secret_code | STRING |
| doc_path | STRING |
| employeurId | INTEGER → Employeur |
| cotisation_employeurId | INTEGER → CotisationEmployeur |
| paiementId | INTEGER → Paiement |
| createdAt | DATE |
| updatedAt | DATE |

---

## Quitus  
**Fichier:** `db/quitus/model.js` · **Table:** `quitus`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| reference | STRING |
| secret_code | STRING |
| path | STRING |
| quitus_expire_date | STRING |
| employeurId | INTEGER → Employeur |
| demandeId | INTEGER → Demande |
| createdAt | DATE |
| updatedAt | DATE |

---

## RequestEmployeur  
**Fichier:** `db/request_employeur/model.js` · **Table:** `request_employeurs`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| first_name | TEXT |
| last_name | TEXT |
| date_of_birth | DATE |
| place_of_birth | TEXT |
| gender | TEXT |
| prefecture | TEXT |
| email | STRING |
| phone_number | STRING |
| TYPE_ATTACHEMENTS | TEXT |
| file | TEXT |
| avatar | TEXT |
| address | TEXT |
| createdAt | DATE |
| updatedAt | DATE |

---

## Succursale  
**Fichier:** `db/succursale/model.js` · **Table:** `succursales`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| first_name | STRING |
| last_name | STRING |
| raison_sociale | STRING |
| no_immatriculation | STRING (unique) |
| phone_number | STRING |
| email | STRING |
| address | STRING |
| effectif_femme | BIGINT (default 0) |
| effectif_homme | BIGINT (default 0) |
| effectif_apprentis | BIGINT (default 0) |
| fax | STRING |
| no_dni | TEXT |
| no_rccm | TEXT |
| date_creation | DATE |
| date_first_embauche | DATE |
| main_activity | STRING |
| category | STRING |
| active_btn | BOOLEAN (default false) |
| who_valid | BIGINT |
| is_valid | BOOLEAN (default false) |
| valid_date | DATE |
| status | STRING (default 'En cours de validation') |
| employeur_valid | BOOLEAN (default false) |
| rccm_file | STRING |
| dni_file | STRING |
| DPAE_file | STRING |
| logo | STRING |
| no_maison_mere | STRING |
| prefecture | STRING |
| requeter_photo | STRING |
| is_adhesion | BOOLEAN (default false) |
| employeurId | INTEGER → Employeur |
| createdAt | DATE |
| updatedAt | DATE |

---

## Users  
**Fichier:** `db/users/model.js` · **Table:** `users`

| Attribut | Type |
|----------|------|
| id | INTEGER (PK, autoIncrement) |
| user_identify | STRING |
| identity | STRING |
| role | STRING (default 'admin') |
| type | STRING (default 'admin') |
| password | STRING |
| full_name | STRING |
| email | STRING |
| phone_number | STRING |
| user_id | BIGINT |
| first_login | BOOLEAN (default false) |
| can_work | BOOLEAN (default true) |
| last_connect_time | DATE |
| otp_secret | STRING |
| createdAt | DATE |
| updatedAt | DATE |

---

**Note :** Les modèles `Pays`, `Branche` et `Activity` sont exposés via `db/pays/model.js`, `db/branches/model.js` et `db/domain_activite/model.js` qui requirent respectivement `pays.model.js`, `branche.model.js` et `activity.model.js`.
