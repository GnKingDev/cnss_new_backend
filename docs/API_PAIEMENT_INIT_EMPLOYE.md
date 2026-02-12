# Route `GET /api/v1/paiement/init/:id` – Initiation d’un paiement (employé)

Cette route permet à un **employé connecté** (ex. rôle Payeur) d’**initier un paiement** pour une déclaration de cotisation. Elle retourne un **lien de paiement** (Paylican) à afficher ou rediriger pour « Effectuer un paiement ».  
Code : `db/paiement/route.js`, lignes 357-435.

---

## 1. URL et méthode

| Élément | Valeur |
|--------|--------|
| **Méthode** | `GET` |
| **Chemin** | `/init/:id` |
| **URL complète** | **`GET /api/v1/paiement/init/:id`** |
| **Authentification** | **EmployeToken** : `Authorization: Bearer <token_employe>` |

Le paramètre **`:id`** est l’**ID de la déclaration de cotisation** (`cotisation_employeurId`), et non l’ID du paiement.

---

## 2. Objectif et déroulement

1. **Vérifier l’employé et l’employeur**  
   L’employé connecté est identifié par `req.user.user_id`. On charge l’employé avec son **employeur**. Si employé ou employeur absent → **404**.

2. **Obtenir ou créer le paiement**  
   On cherche un enregistrement **Paiement** pour cette cotisation (`cotisation_employeurId = :id`).  
   - S’il existe : on le réutilise.  
   - S’il n’existe pas : on vérifie que la cotisation existe, puis on **crée** un nouveau paiement (statut `Nouveau`, lié à la cotisation et à l’employeur de l’employé connecté).

3. **Générer ou réutiliser le lien de paiement**  
   - Si le paiement a déjà un **merchantReference** et un **invoiceId** (lien Paylican déjà créé) : on régénère le lien à partir de ces données, on met à jour `employeId` et le statut `Nouveau`, puis on retourne ce lien **sans** rappeler l’API Paylican.  
   - Sinon : on appelle **Paylican** (`utility.initPaiment`) pour créer la facture / session de paiement, on enregistre `merchantReference`, `invoiceId`, `employeId` et le statut `Nouveau`, puis on génère le lien avec `utility.getPaymentLink(detail)`.

4. **Réponse**  
   Retour d’un objet `{ link }` contenant l’URL vers la page de paiement (télépaiement).

---

## 3. Requête

| Élément | Description |
|--------|-------------|
| **Méthode** | `GET` |
| **En-tête** | `Authorization: Bearer <token_employe>` |
| **Paramètre de chemin** | **`:id`** = ID de la déclaration (cotisation employeur). |

**Exemple :**

```
GET /api/v1/paiement/init/42
Authorization: Bearer <token_employe>
```

(Ici, `42` est le `cotisation_employeurId` de la déclaration à payer.)

---

## 4. Réponse 200 (succès)

**Body :**

```json
{
  "link": "https://..."
}
```

`link` est l’URL de la page de paiement (Paylican) à ouvrir dans le navigateur ou en iframe pour que l’utilisateur effectue le paiement.

---

## 5. Erreurs

| Code | Situation |
|------|-----------|
| **400** | **`:id`** invalide (non numérique) → *ID de cotisation invalide*. |
| **400** | Erreur lors de l’initiation (ex. Paylican) → *Erreur pour initiation du paiement*. |
| **404** | Employé ou employeur non trouvé → *Employé ou employeur non trouvé*. |
| **404** | Cotisation inexistante (lors de la création du paiement) → *Cotisation non trouvée*. |

Les réponses **401** / **403** sont gérées par le middleware **EmployeToken** si le token est absent ou invalide.

---

## 6. Résumé du flux (côté backend)

```
GET /init/:id (EmployeToken)
    │
    ├─ Parse :id → cotisationId
    ├─ Charger employé + employeur (req.user.user_id)
    ├─ Si pas d’employé/employeur → 404
    │
    ├─ Trouver Paiement par cotisation_employeurId = cotisationId
    │   └─ Si aucun → vérifier cotisation, créer Paiement (Nouveau)
    │
    ├─ Si Paiement a déjà merchantReference + invoiceId
    │   └─ Régénérer link, mettre à jour employeId/status, retourner { link }
    │
    ├─ Sinon : initPaiment(Paiement, employeur, UUID) → Paylican
    ├─ Enregistrer merchantReference, invoiceId, employeId, status
    └─ getPaymentLink(detail) → 200 { link }
```

---

## 7. Contexte « Effectuer un paiement »

Sur la page **Effectuer un paiement**, l’utilisateur (employé/payeur) voit en général une **liste des déclarations à payer** (ou des paiements en statut « Nouveau »). Pour une ligne donnée, le front appelle **`GET /api/v1/paiement/init/:id`** en passant l’**ID de la cotisation** (`cotisation_employeurId`) de cette ligne. La réponse `link` est ensuite utilisée pour rediriger l’utilisateur vers la page de paiement ou l’afficher (iframe / nouvelle fenêtre).
