# Nationalité – Valeurs acceptées

Au niveau **nationalité** (champ `nationality`), le système n’accepte que deux valeurs :

| Valeur   | Description        |
|----------|--------------------|
| **Guinée** | Nationalité guinéenne |
| **Autre**  | Toute autre nationalité |

---

## Où est utilisé le champ `nationality` ?

- **Création d’un employé** : body JSON `employe` (multipart) → champ `nationality`.
- **Mise à jour d’un employé** (employeur) : `POST /api/v1/employe/update_employe/:employe_id` → body peut contenir `nationality`.
- **Réponses API** : fiche employé, `verify_employe`, liste, etc. renvoient le champ `nationality` (string ou `null`).

---

## Règles pour le frontend

1. **Sélecteur / formulaire** : proposer uniquement **« Guinée »** et **« Autre »** (liste déroulante ou boutons).
2. **Envoi** : envoyer exactement l’une de ces chaînes (ou ne pas envoyer le champ si non renseigné).
3. **Valeur optionnelle** : le champ peut être absent ou `null` (nationalité non renseignée).

---

## Réponse du backend en cas de valeur invalide

Si une autre valeur que « Guinée » ou « Autre » est envoyée, le backend répond **400** :

```json
{
  "message": "Nationalité invalide. Valeurs acceptées : Guinée, Autre"
}
```

---

## Exemples de valeurs valides

- `"Guinée"`
- `"Autre"`
- `null` / champ absent

## Exemples de valeurs invalides

- `"France"`, `"Sénégal"`, etc. → refusées (utiliser **« Autre »** à la place).
