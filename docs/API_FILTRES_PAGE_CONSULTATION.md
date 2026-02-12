# Filtres de la page Consultation (Télédéclaration > Consultation)

Ce document liste **tous les filtres** de la vue **Consultation** (liste des déclarations de cotisation) : libellés, paramètres API, formats et comportement attendu.

---

## 1. Vue d’ensemble

La page **Télédéclaration > Consultation** affiche les déclarations de l’employeur connecté. Les filtres permettent de restreindre la liste par **recherche texte**, **année** et **plage de dates**. La **pagination** et le **bouton Exporter** complètent l’interface.

**Route API utilisée :** `GET /api/v1/cotisation_employeur/list`  
**Authentification :** `EmployeurToken`

---

## 2. Liste de tous les filtres (interface utilisateur)

| # | Élément UI | Type | Libellé / placeholder | Obligatoire |
|---|------------|------|------------------------|-------------|
| 1 | **Recherche** | Champ texte | `Rechercher par période ou date...` | Non |
| 2 | **Année** | Liste déroulante | Valeur par défaut : `Toutes les années` | Non |
| 3 | **Date début** | Input date (ou date picker) | Label : `Date début` | Non |
| 4 | **Date fin** | Input date (ou date picker) | Label : `Date fin` | Non |
| 5 | **Pagination** | Contrôles (page, précédent/suivant) | Page courante, nombre par page | Non |
| 6 | **Exporter** | Bouton + menu | `Exporter` → PDF, Excel, CSV | Non (action) |

---

## 3. Correspondance filtres UI ↔ paramètres API

| Filtre UI | Paramètre API (query) | Type envoyé | Description technique |
|-----------|------------------------|-------------|------------------------|
| **Recherche** | `search` | string | Recherche sur **période** (ex. JANVIER, MARS), **trimestre** ou **année** (4 chiffres). Backend : `LIKE` sur periode/trimestre, ou égalité sur year si 4 chiffres. |
| **Année** | `year` | number ou string | Année (ex. `2025`). Si « Toutes les années » : **ne pas envoyer** `year` ou envoyer `year=all`. |
| **Date début** | `date_debut` | string | Date inclus (déclarations avec date **≥** cette date). Format recommandé : **ISO** `YYYY-MM-DD` (ex. `2025-01-01`). Backend accepte aussi **jj/mm/aaaa**. |
| **Date fin** | `date_fin` | string | Date inclus (déclarations avec date **≤** cette date). Même format que date_debut. |
| **Page courante** | `page` | number | Numéro de page (défaut backend : 1). |
| **Nombre par page** | `pageSize` | number | Éléments par page (défaut : 10, max : 100). |

**Exporter** : réutilise les **mêmes** critères (`year`, `date_debut`, `date_fin`, `search`) + le **format** (pdf, excel, csv) sur la route d’export (quand elle est disponible).

---

## 4. Règles de validation (front)

| Règle | Comportement |
|-------|----------------|
| **Date début > Date fin** | Backend renvoie **400** avec `"La date début ne peut pas être après la date fin"`. Le front peut bloquer la soumission ou afficher un message avant l’appel. |
| **Format des dates** | Affichage utilisateur : **jj/mm/aaaa**. Envoi API recommandé : **YYYY-MM-DD** pour éviter toute ambiguïté. |
| **Année « Toutes »** | Ne pas envoyer le paramètre `year` (ou envoyer `year=all`) pour ne pas filtrer par année. |
| **Champs vides** | Ne pas envoyer les paramètres vides (ou les omettre) : le backend ignore les filtres absents. |

---

## 5. Exemples d’URL (GET)

| Cas | URL (sans le domaine) |
|-----|------------------------|
| Aucun filtre | `/api/v1/cotisation_employeur/list?page=1&pageSize=10` |
| Année 2025 | `/api/v1/cotisation_employeur/list?year=2025&page=1&pageSize=10` |
| Plage de dates | `/api/v1/cotisation_employeur/list?date_debut=2025-01-01&date_fin=2025-03-31&page=1&pageSize=20` |
| Recherche + année | `/api/v1/cotisation_employeur/list?search=MARS&year=2025&page=1&pageSize=10` |
| Tous les critères | `/api/v1/cotisation_employeur/list?year=2025&date_debut=2025-01-01&date_fin=2025-12-31&search=JANVIER&page=1&pageSize=20` |

---

## 6. Réponse API et affichage

- **totalItems** : utilisé pour afficher **« X déclaration(s) trouvée(s) »**.
- **data** : lignes du tableau (colonnes : Date, Période, Eff. entrants, Eff. sortants, Total employés, Salaires bruts, Salaires soumis, Cotisations, Action).
- **pagination** : **totalPages**, **currentPage**, **pageSize** pour les contrôles de pagination.

---

## 7. Récapitulatif des paramètres (liste exhaustive)

| Paramètre | Envoyé par | Valeurs / format | Effet |
|-----------|------------|------------------|--------|
| `search` | Champ Recherche | string (texte libre) | Filtre sur période, trimestre ou année (4 chiffres). |
| `year` | Liste Année | number ou `"all"` ou absent | Filtre par année ; absent ou `all` = toutes les années. |
| `date_debut` | Date début | `YYYY-MM-DD` ou jj/mm/aaaa | Déclarations avec date ≥ date_debut. |
| `date_fin` | Date fin | `YYYY-MM-DD` ou jj/mm/aaaa | Déclarations avec date ≤ date_fin. |
| `page` | Pagination | number (≥ 1) | Page demandée. |
| `pageSize` | Pagination | number (1–100) | Nombre d’éléments par page. |

Tous les paramètres sont **optionnels**. Les filtres non renseignés ne sont pas envoyés ; le backend renvoie alors toutes les déclarations (sous réserve de la pagination).
