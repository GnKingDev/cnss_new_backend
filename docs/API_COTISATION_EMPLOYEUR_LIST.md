# Route `list` – Liste des déclarations de cotisation (employeur) – Filtres et pagination

Route qui permet à l’employeur connecté de récupérer la **liste paginée de ses déclarations de cotisation** (principal + complémentaires), **filtrée par année, plage de dates et recherche**, avec les lignes de déclaration par employé associées. Utilisée par la vue **Télédéclaration > Consultation**.

---

## URL et méthode

| Élément | Valeur |
|--------|--------|
| **Méthode** | `GET` |
| **URL** | **`GET /api/v1/cotisation_employeur/list`** (ou `GET /api/cotisations-employeur/list`) |
| **Authentification** | **EmployeurToken** : `Authorization: Bearer <token_employeur>` |

---

## Requête – Filtres et pagination

Tous les paramètres sont **optionnels** et passés en **query** :

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `year` | number ou string | Non | Année (ex. `2025`). Si absent ou `"all"` → toutes les années. |
| `date_debut` | string | Non | Date début (inclus). Format **ISO** `YYYY-MM-DD` ou **jj/mm/aaaa**. Déclarations avec date de création **≥** date début. |
| `date_fin` | string | Non | Date fin (inclus). Format **ISO** `YYYY-MM-DD` ou **jj/mm/aaaa**. Déclarations avec date de création **≤** date fin. |
| `search` | string | Non | Recherche texte : sur la **période** (ex. "JANVIER", "MARS"), le **trimestre**, ou l’**année** (4 chiffres). |
| `page` | number | Non | Numéro de page (défaut : 1). |
| `pageSize` | number | Non | Nombre d’éléments par page (défaut : 10, max : 100). |

**Exemples :**

- `GET /api/v1/cotisation_employeur/list`
- `GET /api/v1/cotisation_employeur/list?year=2025&page=1&pageSize=20`
- `GET /api/v1/cotisation_employeur/list?date_debut=2025-01-01&date_fin=2025-03-31`
- `GET /api/v1/cotisation_employeur/list?search=MARS&year=2025`
- « Toutes les années » : ne pas envoyer `year` ou envoyer `year=all`

---

## Réponse 200 (succès)

**Body :** objet paginé :

```json
{
  "totalItems": 24,
  "totalPages": 3,
  "currentPage": 1,
  "pageSize": 10,
  "data": [
    {
      "id": 42,
      "periode": "MARS",
      "trimestre": null,
      "year": 2026,
      "total_salary": 50000000,
      "total_salary_soumis_cotisation": 45000000,
      "total_cotisation_employe": 2250000,
      "total_cotisation_employeur": 8100000,
      "total_cotisation": 10350000,
      "total_branche": 10350000,
      "effectif_embauche": 2,
      "current_effectif": 45,
      "facture_path": "/api/v1/docsx/Appel_retour_de_cotisation-7-MARS-2026-xxx.pdf",
      "motif": "FACTURATION SUR PRINCIPAL",
      "employeurId": 7,
      "createdAt": "2026-03-15T10:00:00.000Z",
      "declarations_employes": [
        {
          "id": 101,
          "salary_brut": 1200000,
          "salary_soumis_cotisation": 1200000,
          "cotisation_employe": 60000,
          "cotisation_emplyeur": 216000,
          "total_cotisation": 276000,
          "employeId": 1,
          "employe": {
            "id": 1,
            "first_name": "Mamadou",
            "last_name": "Diallo",
            "no_immatriculation": "8204000123456",
            "matricule": "MAT001"
          }
        }
      ]
    }
  ]
}
```

Chaque élément de **`data`** est une **déclaration** (cotisation_employeur) avec notamment :
- **id**, **periode**, **year**, **trimestre**, **createdAt** (date de la déclaration)
- **total_salary**, **total_salary_soumis_cotisation**, **total_cotisation_employe**, **total_cotisation_employeur**, **total_cotisation**, **total_branche**
- **effectif_embauche**, **effectif_leave**, **current_effectif**
- **facture_path** : chemin du PDF (affichage via `GET /api/v1/docsx/<filename>`)
- **motif** (ex. "FACTURATION SUR PRINCIPAL" ou "FACTURATION COMPLEMENTAIRE SUR PRINCIPAL")
- **declarations_employes** : tableau des lignes de déclaration par employé (avec association **employe** : nom, prénom, immatriculation, etc.)

### Correspondance colonnes tableau (vue Consultation)

| Colonne affichée | Champ API (snake_case) | Champ API (camelCase suggéré front) |
|------------------|------------------------|-------------------------------------|
| Date | `createdAt` | `date` (formatée jj/mm/aaaa) |
| Période | `periode`, `year` | `period` (ex. "Janvier 2025", "MARS") |
| Eff. entrants | `effectif_embauche` | `employeesIn` |
| Eff. sortants | `effectif_leave` | `employeesOut` |
| Total employés | `current_effectif` | `totalEmployees` |
| Salaires bruts | `total_salary` | `grossSalary` |
| Salaires soumis | `total_salary_soumis_cotisation` | `salarySubjectToContribution` |
| Cotisations | `total_cotisation` ou `total_branche` | `totalContribution` |

---

## Réponse 400

- **`"La date début ne peut pas être après la date fin"`** : si `date_debut` > `date_fin`.
- Autre exception : `{ "message": "<error.message>" }`.

---

## Comportement du front (vue Consultation)

1. **Filtres** : afficher les champs **Recherche** (search), **Année** (year, avec option « Toutes les années »), **Date début** (date_debut), **Date fin** (date_fin). Envoyer les valeurs en query : dates de préférence en **ISO** `YYYY-MM-DD` (ou jj/mm/aaaa accepté par le backend).
2. **Appel** : `GET /api/v1/cotisation_employeur/list?year=...&date_debut=...&date_fin=...&search=...&page=1&pageSize=20` avec **Authorization: Bearer &lt;token&gt;**.
3. **Si 200** :
   - Afficher **« X déclaration(s) trouvée(s) »** avec **X = totalItems**.
   - Afficher le tableau des déclarations (colonnes ci‑dessus) et la pagination (**totalPages**, **currentPage**, **pageSize**).
   - Lien facture : `GET <baseUrl>/api/v1/docsx/<nom_fichier_extrait_du_path>`.
   - **declarations_employes** : détail par employé (ex. modale ou sous-panel).
4. **Si 400** : afficher **message** (ex. date début > date fin).
5. **Export** : réutiliser les **mêmes paramètres** (year, date_debut, date_fin, search) pour la route d’export (PDF, Excel, CSV) lorsqu’elle sera exposée.

En résumé : cette route sert à **lister et filtrer les déclarations** (année, plage de dates, recherche période/trimestre/année), avec pagination et accès au PDF facture.
