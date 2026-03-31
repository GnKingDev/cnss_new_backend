/**
 * Spécification OpenAPI 3.0 — API Mobile Affiliation Volontaire CNSS
 */
const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'CNSS — API Mobile Affiliation Volontaire',
    version: '1.0.0',
    description: `
## API destinée à l'application mobile — Affiliation Volontaire CNSS

Cette API couvre le parcours complet d'un affilié volontaire depuis son téléphone :

1. **Demande** — Simulation et soumission d'une demande d'affiliation
2. **Authentification** — Login, OTP, déconnexion, mot de passe
3. **Mon profil** — Détail complet de l'affiliation connectée
4. **Mes télédéclarations** — Déclarations mensuelles et statut de paiement
5. **Paiement** — Paiement via Djomy (Orange Money / MTN MoMo)
6. **Mes documents** — Pièces jointes, quittances PDF

---

### Authentification
Les endpoints marqués 🔒 nécessitent un token JWT dans le header HTTP :
\`\`\`
Authorization: Bearer <token>
\`\`\`
Le token est obtenu en deux étapes :
1. \`POST /api/v1/av/auth/login\` → retourne un **token temporaire**
2. \`POST /api/v1/av/auth/verify_otp\` → retourne le **token de session**

Le token de session est valide jusqu'à déconnexion explicite (\`signOut\`) ou expiration Redis.

---

### Codes de statut HTTP utilisés

| Code | Signification |
|------|--------------|
| \`200\` | Succès |
| \`201\` | Ressource créée |
| \`400\` | Données invalides ou manquantes |
| \`401\` | Token absent ou invalide |
| \`403\` | Accès interdit (token valide mais ressource non autorisée) |
| \`404\` | Ressource non trouvée |
| \`500\` | Erreur interne serveur |
| \`503\` | Service externe non configuré (Djomy) |

---

### Format des données

| Type | Format |
|------|--------|
| Montants | Entiers en **GNF** (Franc Guinéen) |
| Dates | ISO 8601 : \`YYYY-MM-DD\` ou \`YYYY-MM-DDTHH:mm:ssZ\` |
| Périodes | \`"01"\` à \`"12"\` (mois avec zéro initial) |
| Téléphone paiement | **9 chiffres** sans indicatif (ex: \`623707722\`) — le backend ajoute \`00224\` |
| Téléphone profil | Format complet \`00224XXXXXXXXX\` |
    `,
    contact: { name: 'CNSS Guinée — Direction Informatique' }
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Développement local' },
    { url: 'https://av.cnss.gov.gn', description: 'Production' }
  ],
  tags: [
    { name: '0. Référentiels',       description: 'Données de référence publiques — préfectures et branches d\'activité (sans authentification)' },
    { name: '1. Demande',            description: 'Simulation de cotisation et soumission d\'une demande d\'affiliation — sans authentification' },
    { name: '2. Authentification',   description: 'Login, validation OTP, vérification token, déconnexion, réinitialisation et changement de mot de passe' },
    { name: '3. Mon profil',         description: 'Données complètes de l\'affilié connecté (informations personnelles, prestations, cotisation)' },
    { name: '4. Mes télédéclarations', description: 'Liste mensuelle des déclarations de cotisation et suivi du statut de paiement' },
    { name: '5. Paiement',           description: 'Initiation du paiement via Djomy (OM/MOMO), suivi du statut et webhook de confirmation' },
    { name: '6. Mes documents',      description: 'Quittances de paiement (PDF à la volée) et pièces jointes uploadées lors de la demande' },
  ],

  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: `Token JWT obtenu après login + validation OTP.
- **Token temporaire** (login) : valide 30 min, utilisable uniquement pour \`verify_otp\` et \`resend_otp\`
- **Token de session** (verify_otp) : valide jusqu'à déconnexion ou expiration Redis
- **Token first_login** (verify_otp quand first_login=true) : utilisable uniquement pour \`resete_password_first_login\``
      }
    },
    schemas: {

      Error: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Erreur interne du serveur', description: 'Description lisible de l\'erreur' }
        }
      },

      SimulationInput: {
        type: 'object',
        required: ['revenu_annuel'],
        properties: {
          revenu_annuel: {
            type: 'integer',
            example: 12000000,
            description: 'Revenu annuel brut de l\'affilié en GNF. Doit être > 0.'
          },
          assurance_maladie: {
            type: 'boolean',
            example: true,
            default: false,
            description: 'Activer la prestation Assurance Maladie. Taux : **6,5%** du plafond mensuel.'
          },
          risque_professionnel: {
            type: 'boolean',
            example: true,
            default: false,
            description: 'Activer la prestation Risque Professionnel. Taux : **6%** du plafond mensuel.'
          },
          vieillesse: {
            type: 'boolean',
            example: false,
            default: false,
            description: 'Activer la prestation Vieillesse. Taux : **6,5%** du plafond mensuel.'
          }
        }
      },

      SimulationResult: {
        type: 'object',
        properties: {
          revenu_annuel:       { type: 'integer', example: 12000000, description: 'Revenu annuel saisi (GNF)' },
          revenu_mensuel:      { type: 'integer', example: 1000000,  description: 'revenu_annuel ÷ 12' },
          plafond:             { type: 'integer', example: 1000000,  description: 'Revenu mensuel plafonné. Minimum : 550 000 GNF. Maximum : 2 500 000 GNF. C\'est cette valeur qui sert de base de calcul.' },
          cotisation:          { type: 'integer', example: 125000,   description: 'Cotisation mensuelle = plafond × (somme des taux des prestations actives)' },
          montant_trimestriel: { type: 'integer', example: 375000,   description: 'cotisation × 3 — montant à payer chaque trimestre' }
        }
      },

      AffiliationVolontaire: {
        type: 'object',
        properties: {
          id:                             { type: 'integer',  example: 1 },
          nom:                            { type: 'string',   example: 'Diallo' },
          prenom:                         { type: 'string',   example: 'Mamadou' },
          date_naissance:                 { type: 'string',   format: 'date',      example: '1990-05-15' },
          lieu_naissance:                 { type: 'string',   example: 'Conakry' },
          sexe:                           { type: 'string',   enum: ['M', 'F'],    example: 'M' },
          adresse:                        { type: 'string',   example: 'Quartier Madina, Conakry' },
          phone_number:                   { type: 'string',   example: '00224623707722' },
          email:                          { type: 'string',   example: 'mamadou.diallo@email.com' },
          profession:                     { type: 'string',   example: 'Commerçant' },
          no_immatriculation:             { type: 'string',   example: 'AV-2024-000001', description: 'Attribué par la CNSS après validation. Null avant validation.' },
          status:                         { type: 'string',   example: 'Validé',   description: 'Nouveau | En cours de traitement | Validé' },
          is_validated:                   { type: 'boolean',  example: true,       description: 'true = affiliation validée par un agent CNSS' },
          validated_date:                 { type: 'string',   format: 'date-time', nullable: true },
          is_risque_professionnel_active: { type: 'boolean',  example: true },
          risque_professionnel_percentage:{ type: 'number',   example: 0.06,       description: 'Taux risque professionnel (ex: 0.06 = 6%)' },
          is_assurance_maladie_active:    { type: 'boolean',  example: true },
          assurance_maladie_percentage:   { type: 'number',   example: 0.065,      description: 'Taux assurance maladie (ex: 0.065 = 6,5%)' },
          is_vieillesse_active:           { type: 'boolean',  example: false },
          vieillesse_percentage:          { type: 'number',   example: 0.065,      description: 'Taux vieillesse (ex: 0.065 = 6,5%)' },
          revenu_annuel:                  { type: 'integer',  example: 12000000 },
          revenu_mensuel:                 { type: 'integer',  example: 1000000 },
          plafond:                        { type: 'integer',  example: 1000000,    description: 'Plafond de cotisation mensuel (borné entre 550 000 et 2 500 000 GNF)' },
          cotisation:                     { type: 'integer',  example: 125000,     description: 'Montant mensuel à payer en GNF' },
          montant_trimestriel:            { type: 'integer',  example: 375000 },
          cni_file_path:                  { type: 'string',   example: '/uploads/cni-1234567890.jpg',    nullable: true, description: 'Chemin de la CNI uploadée' },
          certificat_residence_file:      { type: 'string',   example: '/uploads/cert-1234567890.jpg',   nullable: true, description: 'Chemin du certificat de résidence' },
          requester_picture:              { type: 'string',   example: '/uploads/photo-1234567890.jpg',  nullable: true, description: 'Chemin de la photo du demandeur' },
          branche: {
            type: 'object', nullable: true,
            description: 'Branche CNSS de rattachement',
            properties: {
              id:   { type: 'integer' },
              nom:  { type: 'string', example: 'Branche Conakry' },
              code: { type: 'string', example: 'BCK' }
            }
          },
          prefecture: {
            type: 'object', nullable: true,
            description: 'Préfecture de résidence',
            properties: {
              id:   { type: 'integer' },
              nom:  { type: 'string', example: 'Conakry' },
              code: { type: 'string', example: 'CKY' }
            }
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },

      Declaration: {
        type: 'object',
        properties: {
          id:                      { type: 'integer', example: 42,       description: 'Identifiant unique de la déclaration — utiliser pour initier un paiement' },
          periode:                 { type: 'string',  example: '02',     description: 'Mois : "01" (Janvier) à "12" (Décembre)' },
          year:                    { type: 'integer', example: 2026 },
          montant_cotisation:      { type: 'integer', example: 125000,   description: 'Montant à payer pour ce mois (GNF)' },
          montant_soumis_cotisation:{ type: 'integer', example: 1000000, description: 'Plafond mensuel soumis à cotisation (base de calcul)' },
          revenu_annuel:           { type: 'integer', example: 12000000 },
          revenu_mensuel:          { type: 'integer', example: 1000000 },
          is_paid:                 { type: 'boolean', example: false,    description: '**false** = en attente de paiement | **true** = déclaration payée' },
          createdAt:               { type: 'string',  format: 'date-time' }
        }
      },

      DeclarationStatus: {
        type: 'object',
        description: 'Statut temps réel d\'une déclaration — utilisé pour le polling après initiation d\'un paiement',
        properties: {
          id:                   { type: 'integer', example: 42 },
          is_paid:              { type: 'boolean', example: false,   description: '**true** = paiement confirmé → arrêter le polling' },
          djomy_status: {
            type: 'string', nullable: true, example: 'PENDING',
            enum: ['CREATED', 'PENDING', 'AUTHORIZED', 'SUCCESS', 'CAPTURED', 'FAILED'],
            description: `Statut retourné par Djomy :
- \`null\` — paiement pas encore initié
- \`CREATED\` — demande créée, en attente d'action utilisateur
- \`PENDING\` — en attente de validation sur le téléphone
- \`AUTHORIZED\` — autorisé, capture en cours
- \`SUCCESS\` / \`CAPTURED\` — **paiement confirmé** → arrêter le polling
- \`FAILED\` — paiement échoué → afficher l'erreur`
          },
          djomy_transaction_id: { type: 'string', nullable: true, example: 'TXN-DJOMY-123456', description: 'Référence de transaction Djomy — à conserver pour le support' },
          payment_method:       { type: 'string', nullable: true, example: 'DJOMY_OM', description: 'DJOMY_OM = Orange Money | DJOMY_MOMO = MTN MoMo' }
        }
      },

      DjomyResponse: {
        type: 'object',
        properties: {
          message:                  { type: 'string',  example: 'Paiement initié. Validez la transaction sur votre téléphone.' },
          transactionId:            { type: 'string',  example: 'TXN-DJOMY-123456', description: 'Référence unique Djomy — stocker côté client pour le suivi' },
          status:                   { type: 'string',  example: 'CREATED' },
          redirectUrl:              { type: 'string',  nullable: true, description: 'URL de redirection si applicable (paiement portail)' },
          paymentUrl:               { type: 'string',  nullable: true },
          merchantPaymentReference: { type: 'string',  example: 'uuid-v4', description: 'Référence interne du marchand' }
        }
      },

      Quittance: {
        type: 'object',
        properties: {
          id:                   { type: 'integer', example: 1,                          description: 'Identifiant — utiliser pour GET /quittances/{id}/download' },
          reference:            { type: 'string',  example: 'AV-2024-000001-02-2026',   description: 'Référence unique au format {immatriculation}-{periode}-{année}' },
          periode:              { type: 'string',  example: '02',                        description: 'Mois payé : "01" à "12"' },
          year:                 { type: 'integer', example: 2026 },
          montant:              { type: 'integer', example: 125000,                      description: 'Montant payé en GNF' },
          payment_method:       { type: 'string',  example: 'DJOMY_OM',                  description: 'DJOMY_OM = Orange Money | DJOMY_MOMO = MTN MoMo' },
          djomy_transaction_id: { type: 'string',  example: 'TXN-DJOMY-123456',          nullable: true, description: 'Référence Djomy pour le support' },
          createdAt:            { type: 'string',  format: 'date-time',                  description: 'Date de génération de la quittance' }
        }
      },

      Document: {
        type: 'object',
        properties: {
          id:    { type: 'integer', example: 1 },
          code:  { type: 'string',  example: 'CNI', enum: ['CNI', 'PHOTO', 'CERTIFICAT_RESIDENCE'], description: 'Type du document' },
          label: { type: 'string',  example: "Carte Nationale d'Identité", description: 'Libellé lisible' },
          url:   { type: 'string',  example: '/uploads/cni-1234567890.jpg',  description: 'Chemin à appeler pour télécharger le fichier (GET /uploads/{filename})' },
          type:  { type: 'string',  example: 'file' }
        }
      },

      PaginatedResponse: {
        type: 'object',
        properties: {
          totalItems:  { type: 'integer', example: 12, description: 'Nombre total d\'éléments toutes pages confondues' },
          totalPages:  { type: 'integer', example: 3,  description: 'Nombre total de pages' },
          currentPage: { type: 'integer', example: 1,  description: 'Page actuelle' },
          pageSize:    { type: 'integer', example: 5,  description: 'Nombre d\'éléments par page' }
        }
      }
    }
  },

  paths: {

    // ════════════════════════════════════════════════════
    // 0. RÉFÉRENTIELS — Préfectures & Branches
    // ════════════════════════════════════════════════════

    '/api/v1/prefecture': {
      get: {
        tags: ['0. Référentiels'],
        summary: 'Liste de toutes les préfectures',
        description: `Retourne la liste complète des préfectures de Guinée, triées par ordre alphabétique. **Aucune authentification requise.**

Utiliser cette liste pour peupler les menus déroulants de saisie d'adresse (lieu de naissance, résidence) dans le formulaire de demande d'affiliation volontaire.

### Routes disponibles
| URL | Description |
|-----|-------------|
| \`GET /api/v1/prefecture\` | Toutes les préfectures |
| \`GET /api/v1/prefecture/get_all_prefecture\` | Avec filtres + cache 24h |
| \`GET /api/v1/prefecture/:id\` | Une préfecture par ID |
        `,
        parameters: [
          { name: 'search', in: 'query', required: false, schema: { type: 'string' }, description: 'Filtrer par nom (partiel). Ex: `Conakry`', example: 'Cona' },
          { name: 'paysId', in: 'query', required: false, schema: { type: 'integer', default: 1 }, description: 'Filtrer par pays (paysId=1 = Guinée). Utilisé uniquement sur `/get_all_prefecture`.' }
        ],
        responses: {
          200: {
            description: 'Liste des préfectures retournée avec succès',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id:   { type: 'integer', example: 1 },
                          name: { type: 'string',  example: 'CONAKRY', description: 'Nom en majuscules' },
                          code: { type: 'string',  example: 'CKY',     description: 'Code court alphanumériques (max 10 chars)' }
                        }
                      }
                    }
                  }
                },
                example: {
                  success: true,
                  data: [
                    { id: 1, name: 'CONAKRY',   code: 'CKY' },
                    { id: 2, name: 'COYAH',     code: 'COY' },
                    { id: 3, name: 'DUBRÉKA',   code: 'DUB' },
                    { id: 4, name: 'KINDIA',    code: 'KIN' },
                    { id: 5, name: 'MAMOU',     code: 'MAM' }
                  ]
                }
              }
            }
          },
          500: { description: 'Erreur serveur', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/api/branches': {
      get: {
        tags: ['0. Référentiels'],
        summary: 'Liste de toutes les branches d\'activité',
        description: `Retourne la liste complète des branches d'activité (secteurs économiques) reconnues par la CNSS, triées par ordre alphabétique. **Aucune authentification requise.**

Ces branches correspondent aux secteurs d'activité économique. Elles sont utilisées lors de la demande d'affiliation pour indiquer le domaine d'activité de l'affilié volontaire.

### Routes disponibles
| URL | Description |
|-----|-------------|
| \`GET /api/branches\` | Toutes les branches |
| \`GET /api/branches/:id\` | Une branche par ID (inclut l'activité liée) |
        `,
        responses: {
          200: {
            description: 'Liste des branches retournée avec succès',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id:   { type: 'integer', example: 1 },
                          name: { type: 'string',  example: 'Agriculture', description: 'Nom de la branche d\'activité' },
                          code: { type: 'string',  example: 'AGR',         description: 'Code branche', nullable: true }
                        }
                      }
                    }
                  }
                },
                example: {
                  success: true,
                  data: [
                    { id: 1, name: 'Agriculture' },
                    { id: 2, name: 'Commerce' },
                    { id: 3, name: 'Construction' },
                    { id: 4, name: 'Industrie' },
                    { id: 5, name: 'Services' },
                    { id: 6, name: 'Transport' }
                  ]
                }
              }
            }
          },
          500: { description: 'Erreur serveur', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    // ════════════════════════════════════════════════════
    // 1. DEMANDE
    // ════════════════════════════════════════════════════

    '/affiliation-volontaire/simulation': {
      post: {
        tags: ['1. Demande'],
        summary: 'Simuler la cotisation mensuelle',
        description: `Calcule la cotisation mensuelle selon le revenu annuel et les prestations choisies. **Aucune authentification requise.**

### Règles de calcul

\`\`\`
plafond     = max(550 000, min(revenu_annuel ÷ 12, 2 500 000))  [GNF]
cotisation  = plafond × (taux_maladie + taux_risque + taux_vieillesse)
\`\`\`

Taux par défaut :
| Prestation | Taux |
|------------|------|
| Assurance maladie | 6,5% |
| Risque professionnel | 6% |
| Vieillesse | 6,5% |

### Exemple
- Revenu annuel : 12 000 000 GNF → revenu mensuel : 1 000 000 → plafond : 1 000 000
- Maladie (6,5%) + Risque (6%) = 12,5% → cotisation = **125 000 GNF/mois**`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SimulationInput' },
              examples: {
                'Maladie + Risque': {
                  summary: 'Deux prestations activées',
                  value: { revenu_annuel: 12000000, assurance_maladie: true, risque_professionnel: true, vieillesse: false }
                },
                'Toutes prestations': {
                  summary: 'Les trois prestations actives',
                  value: { revenu_annuel: 18000000, assurance_maladie: true, risque_professionnel: true, vieillesse: true }
                },
                'Petit revenu': {
                  summary: 'Revenu inférieur au plafond minimum',
                  value: { revenu_annuel: 3000000, assurance_maladie: true, risque_professionnel: false, vieillesse: false }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Simulation calculée',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SimulationResult' } } }
          },
          400: {
            description: '`revenu_annuel` absent ou invalide',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'revenu_annuel requis' } } }
          }
        }
      }
    },

    '/affiliation-volontaire/request_affiliation_volontaire': {
      post: {
        tags: ['1. Demande'],
        summary: 'Soumettre une demande d\'affiliation',
        description: `Crée une nouvelle demande d\'affiliation volontaire avec les pièces justificatives. **Aucune authentification requise.**

### Statut initial
La demande est créée avec \`status = "Nouveau"\` et \`is_validated = false\`.
Un agent CNSS la traitera et validera manuellement.

### Après validation
- Un **numéro d'immatriculation** est attribué (\`AV-{année}-{id}\`)
- Des **identifiants de connexion** sont transmis à l'affilié
- Les **déclarations mensuelles** sont générées automatiquement

### Pièces justificatives
Toutes les pièces sont optionnelles à la soumission mais obligatoires pour la validation :
- **CNI** : photo de la Carte Nationale d'Identité
- **Photo** : portrait du demandeur
- **Certificat de résidence** : document officiel de résidence`,
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['request_affiliation_volontaire'],
                properties: {
                  request_affiliation_volontaire: {
                    type: 'string',
                    description: `Données de la demande sérialisées en JSON. Champs disponibles :

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| \`nom\` | string | ✓ | Nom de famille |
| \`prenom\` | string | ✓ | Prénom |
| \`date_naissance\` | date | ✓ | Format YYYY-MM-DD |
| \`lieu_naissance\` | string | ✓ | Ville ou commune |
| \`sexe\` | string | ✓ | "M" ou "F" |
| \`adresse\` | string | ✓ | Adresse complète |
| \`phone_number\` | string | ✓ | Format 00224XXXXXXXXX |
| \`email\` | string | ✓ | Email valide |
| \`profession\` | string | ✓ | Profession exercée |
| \`revenu_annuel\` | integer | ✓ | Revenu annuel en GNF |
| \`is_assurance_maladie_active\` | boolean | | Prestation maladie |
| \`is_risque_professionnel_active\` | boolean | | Prestation risque prof. |
| \`is_vieillesse_active\` | boolean | | Prestation vieillesse |
| \`brancheId\` | integer | | ID de la branche CNSS |
| \`prefectureId\` | integer | | ID de la préfecture |`,
                    example: JSON.stringify({
                      nom: 'Diallo', prenom: 'Mamadou',
                      date_naissance: '1990-05-15', lieu_naissance: 'Conakry',
                      sexe: 'M', adresse: 'Quartier Madina, Conakry',
                      phone_number: '00224623707722', email: 'mamadou.diallo@email.com',
                      profession: 'Commerçant', revenu_annuel: 12000000,
                      is_assurance_maladie_active: true,
                      is_risque_professionnel_active: true,
                      is_vieillesse_active: false,
                      brancheId: 2, prefectureId: 1
                    })
                  },
                  cni: { type: 'string', format: 'binary', description: 'Photo CNI (JPG, PNG, PDF — max 10 MB)' },
                  requester_picture: { type: 'string', format: 'binary', description: 'Photo portrait du demandeur (JPG, PNG — max 10 MB)' },
                  certificat_residence: { type: 'string', format: 'binary', description: 'Certificat de résidence (JPG, PNG, PDF — max 10 MB)' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Demande soumise — en attente de validation CNSS',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: "Demande d'affiliation volontaire soumise avec succès" } } } } }
          },
          400: { description: 'Données invalides ou champ obligatoire manquant', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    // ════════════════════════════════════════════════════
    // 2. AUTHENTIFICATION
    // ════════════════════════════════════════════════════

    '/api/v1/av/auth/login': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Connexion — étape 1 : identifiants',
        description: `Première étape du login. Vérifie l'identifiant et le mot de passe.

### En cas de succès
- Un **code OTP à 6 chiffres** est envoyé par **email ET SMS** simultanément
- Un **token temporaire** (valide **30 minutes**) est retourné → à passer dans le header \`Authorization\` pour \`verify_otp\` et \`resend_otp\`

### Identifiant accepté
- Numéro d'immatriculation (ex: \`AV-2024-000001\`)
- Adresse email

### Sécurité
- Le mot de passe est vérifié avec bcrypt
- 3 erreurs consécutives n'entraînent pas de blocage (pas de rate limiting implémenté côté serveur)`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user_identify', 'password'],
                properties: {
                  user_identify: { type: 'string', example: 'AV-2024-000001', description: 'Numéro d\'immatriculation (ex: AV-2024-000001) ou adresse email' },
                  password:      { type: 'string', example: 'MonMotDePasse123', description: 'Mot de passe du compte' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Identifiants valides — OTP envoyé',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token:        { type: 'string', description: '⚠️ Token **temporaire** — valide 30 min. À utiliser uniquement pour `verify_otp` et `resend_otp`' },
                    email:        { type: 'string', example: 'ma***@email.com',   nullable: true, description: 'Email masqué pour affichage (confirmation d\'envoi)' },
                    phone_number: { type: 'string', example: '002246237***22',    nullable: true, description: 'Téléphone masqué pour affichage (confirmation d\'envoi)' },
                    otp_code:     { type: 'string', example: '483921', description: '🔧 **Dev uniquement** — Code OTP en clair pour faciliter les tests mobiles. **À retirer avant mise en production.**' }
                  }
                }
              }
            }
          },
          400: {
            description: 'Identifiant ou mot de passe incorrect',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Mot de passe ou identification incorrecte' } } }
          }
        }
      }
    },

    '/api/v1/av/auth/verify_otp': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Connexion — étape 2 : validation OTP',
        description: `Deuxième et dernière étape du login. Valide le code OTP reçu par email/SMS.

### En cas de succès
- Retourne le **token de session JWT** principal
- Si \`first_login: true\` → l'utilisateur **doit** changer son mot de passe avant d'accéder à l'application (utiliser \`resete_password_first_login\`)

### Durée de validité du code OTP
Le code OTP est valide pendant **5 minutes** après réception. Passé ce délai, utiliser \`resend_otp\`.

### Token reçu
Conserver ce token côté client et l'envoyer dans tous les appels suivants :
\`Authorization: Bearer <token>\``,
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code'],
                properties: {
                  code: { type: 'string', example: '123456', description: 'Code OTP à 6 chiffres reçu par email et/ou SMS' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'OTP validé — token de session retourné',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token:       { type: 'string', description: '✅ Token de session — à utiliser pour tous les endpoints protégés' },
                    first_login: { type: 'boolean', example: false, description: '**true** = première connexion → rediriger vers `resete_password_first_login` avant tout autre écran' },
                    message:     { type: 'string', nullable: true, example: 'Première connexion. Veuillez changer votre mot de passe.' }
                  }
                }
              }
            }
          },
          400: { description: 'Code OTP incorrect ou expiré', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Code OTP incorrect ou expiré. Réessayez ou demandez un nouveau code.' } } } },
          401: { description: 'Token temporaire absent ou invalide' }
        }
      }
    },

    '/api/v1/av/auth/resend_otp': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Renvoyer le code OTP',
        description: `Génère un nouveau code OTP et le renvoie par email et SMS.

À utiliser quand :
- Le code n'a pas été reçu
- Le code a expiré (> 5 minutes)

**Nécessite le token temporaire** obtenu au login (pas le token de session).`,
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Nouveau code envoyé',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'Code renvoyé' } } } } }
          },
          401: { description: 'Token temporaire absent ou invalide' }
        }
      }
    },

    '/api/v1/av/auth/verify_token': {
      get: {
        tags: ['2. Authentification'],
        summary: 'Vérifier la validité du token de session',
        description: `Vérifie si le token de session est encore valide et retourne le profil utilisateur complet.

**Utilisation recommandée :** appeler au démarrage de l\'application pour vérifier si la session est active et éviter une redirection inutile vers le login.

Met à jour \`last_connect_time\` et renouvelle la session Redis.`,
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Token valide — profil retourné',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Token valide' },
                    user: {
                      type: 'object',
                      properties: {
                        id:                      { type: 'integer' },
                        user_identify:           { type: 'string',  example: 'AV-2024-000001' },
                        type:                    { type: 'string',  example: 'av' },
                        role:                    { type: 'string',  example: 'av' },
                        last_connect_time:       { type: 'string',  format: 'date-time' },
                        affiliationVolontaire:   { $ref: '#/components/schemas/AffiliationVolontaire' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Token invalide, expiré ou révoqué — rediriger vers le login', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/api/v1/av/auth/signOut': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Déconnexion',
        description: `Révoque la session Redis associée au token. Le token devient immédiatement inutilisable.

⚠️ Supprimer également le token côté client (localStorage, SecureStore, etc.) après la déconnexion.`,
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Session révoquée', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'Déconnexion réussie' } } } } } },
          401: { description: 'Token invalide' }
        }
      }
    },

    '/api/v1/av/auth/verify_imma_send_otp': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Mot de passe oublié — étape 1 : envoi OTP',
        description: `Première étape du flux "mot de passe oublié". Vérifie que le numéro d'immatriculation existe et envoie un code OTP.

**Flux complet :**
1. \`POST verify_imma_send_otp\` → envoie OTP, retourne token temporaire
2. \`POST verify_otp_reset\` → valide le code OTP
3. \`POST reset_password_forgot\` → définit le nouveau mot de passe

**Aucune authentification requise.**`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['immatriculation'],
                properties: {
                  immatriculation: { type: 'string', example: 'AV-2024-000001', description: 'Numéro d\'immatriculation de l\'affilié' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'OTP envoyé par email et SMS',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token:        { type: 'string', description: 'Token temporaire (valide 10 min) à passer dans les étapes suivantes' },
                    email:        { type: 'string', nullable: true, example: 'ma***@email.com', description: 'Email masqué où l\'OTP a été envoyé' },
                    phone_number: { type: 'string', nullable: true, example: '002246237***22', description: 'Téléphone masqué où l\'OTP a été envoyé' }
                  }
                }
              }
            }
          },
          400: { description: 'Numéro d\'immatriculation introuvable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Utilisateur non trouvé' } } } }
        }
      }
    },

    '/api/v1/av/auth/verify_otp_reset': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Mot de passe oublié — étape 2 : validation OTP',
        description: 'Valide le code OTP reçu lors de l\'étape 1. **Nécessite le token temporaire** retourné par `verify_imma_send_otp`.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code'],
                properties: {
                  code: { type: 'string', example: '654321', description: 'Code OTP à 6 chiffres' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'OTP valide — passer à l\'étape 3 (reset_password_forgot)', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'ok' } } } } } },
          400: { description: 'Code OTP expiré ou incorrect', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Code OTP expiré ou incorrect' } } } },
          401: { description: 'Token temporaire absent ou invalide' }
        }
      }
    },

    '/api/v1/av/auth/reset_password_forgot': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Mot de passe oublié — étape 3 : nouveau mot de passe',
        description: `Définit le nouveau mot de passe après validation OTP.

Après succès, l'utilisateur peut se connecter normalement avec le nouveau mot de passe. **Aucun token requis** (endpoint public).

⚠️ Vérifier le code OTP côté client avant d'appeler cet endpoint (étape 2 obligatoire).`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['imma', 'new_password'],
                properties: {
                  imma:         { type: 'string', example: 'AV-2024-000001', description: 'Numéro d\'immatriculation' },
                  new_password: { type: 'string', example: 'NouveauMDP2024!', description: 'Nouveau mot de passe (aucune règle de complexité imposée côté serveur)' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Mot de passe réinitialisé — l\'utilisateur peut se reconnecter', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'Mot de passe réinitialisé avec succès' } } } } } },
          404: { description: 'Immatriculation introuvable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/api/v1/av/auth/resete_password_first_login': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Changer le mot de passe — première connexion',
        description: `Obligatoire quand \`verify_otp\` retourne \`first_login: true\`.

L'utilisateur doit changer son mot de passe temporaire (fourni par la CNSS) avant d'accéder à l'application.

**Nécessite le token first_login** retourné par \`verify_otp\` quand \`first_login: true\`.

Après succès, relancer le flux de connexion normal (login + OTP) pour obtenir un token de session.`,
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user_password', 'new_password'],
                properties: {
                  user_password: { type: 'string', description: 'Mot de passe temporaire fourni par la CNSS lors de la création du compte' },
                  new_password:  { type: 'string', description: 'Nouveau mot de passe choisi par l\'utilisateur' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Mot de passe modifié — relancer login + OTP pour obtenir un token de session', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'Mot de passe modifié avec succès' } } } } } },
          400: { description: 'Mot de passe temporaire incorrect', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Ancien mot de passe incorrect' } } } },
          401: { description: 'Token first_login absent ou invalide' }
        }
      }
    },

    '/api/v1/av/auth/resete_password': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Changer son mot de passe (utilisateur connecté)',
        description: 'Permet à un affilié connecté de changer son mot de passe en connaissant l\'ancien. **Nécessite le token de session.**',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password', 'new_password'],
                properties: {
                  password:     { type: 'string', description: 'Mot de passe actuel' },
                  new_password: { type: 'string', description: 'Nouveau mot de passe souhaité' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Mot de passe modifié avec succès', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'Mot de passe modifié avec succès' } } } } } },
          400: { description: 'Mot de passe actuel incorrect', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Ancien mot de passe incorrect' } } } },
          401: { description: 'Token absent ou invalide' }
        }
      }
    },

    // ════════════════════════════════════════════════════
    // 3. MON PROFIL
    // ════════════════════════════════════════════════════

    '/api/v1/av/auth/affiliation': {
      get: {
        tags: ['3. Mon profil'],
        summary: 'Profil complet de l\'affilié connecté',
        description: `Retourne toutes les informations de l'affiliation volontaire liée au compte connecté.

### Données retournées
- **Informations personnelles** : nom, prénom, date/lieu de naissance, adresse, téléphone, email, profession
- **Prestations souscrites** : maladie, risque professionnel, vieillesse — avec leurs taux
- **Montants** : revenu annuel/mensuel, plafond, cotisation mensuelle, montant trimestriel
- **Statut** : is_validated, status, no_immatriculation
- **Fichiers uploadés** : cni_file_path, requester_picture, certificat_residence_file (chemins \`/uploads/...\`)
- **Branche & Préfecture** : objets complets avec id, nom, code

### Champs fichiers
Les champs \`cni_file_path\`, \`requester_picture\`, \`certificat_residence_file\` contiennent des chemins relatifs.
Pour afficher le fichier : \`GET {server}{chemin}\` (ex: \`GET https://av.cnss.gov.gn/uploads/cni-xxx.jpg\`)`,
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Profil complet de l\'affilié',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AffiliationVolontaire' } } }
          },
          403: { description: 'Aucune affiliation associée à ce compte', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Affiliation non associée à ce compte' } } } },
          404: { description: 'Affiliation non trouvée en base', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Token absent ou invalide' }
        }
      }
    },

    // ════════════════════════════════════════════════════
    // 4. MES TÉLÉDÉCLARATIONS
    // ════════════════════════════════════════════════════

    '/api/v1/av/auth/declarations': {
      get: {
        tags: ['4. Mes télédéclarations'],
        summary: 'Liste paginée des déclarations mensuelles',
        description: `Retourne les déclarations mensuelles de cotisation pour les **12 derniers mois**.

### Génération automatique
Les déclarations sont **créées automatiquement** à chaque appel si elles n'existent pas encore. Une ligne par mois est générée depuis le mois actuel jusqu'à 12 mois en arrière.

### Montants affichés
- \`montant_cotisation\` = montant à payer pour ce mois spécifique
- \`montant_soumis_cotisation\` = plafond mensuel (base de calcul)
- Si la déclaration a un montant personnalisé, il prend la priorité sur le montant de l'affiliation

### Pagination
La liste est triée par **date décroissante** (le mois le plus récent en premier).

| Paramètre | Par défaut | Maximum |
|-----------|------------|---------|
| \`page\` | 1 | — |
| \`pageSize\` | 5 | 50 |`,
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1, minimum: 1 },
            description: 'Numéro de page (commence à 1)'
          },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', default: 5, minimum: 1, maximum: 50 },
            description: 'Nombre de déclarations par page (max 50)'
          }
        ],
        responses: {
          200: {
            description: 'Liste paginée des déclarations',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Declaration' } } } }
                  ]
                },
                example: {
                  data: [
                    { id: 42, periode: '03', year: 2026, montant_cotisation: 125000, montant_soumis_cotisation: 1000000, revenu_annuel: 12000000, revenu_mensuel: 1000000, is_paid: false, createdAt: '2026-03-01T00:00:00.000Z' },
                    { id: 41, periode: '02', year: 2026, montant_cotisation: 5000,   montant_soumis_cotisation: 1000000, revenu_annuel: 12000000, revenu_mensuel: 1000000, is_paid: true,  createdAt: '2026-02-01T00:00:00.000Z' }
                  ],
                  totalItems: 12, totalPages: 3, currentPage: 1, pageSize: 5
                }
              }
            }
          },
          401: { description: 'Token absent ou invalide' },
          403: { description: 'Aucune affiliation associée au compte' }
        }
      }
    },

    '/api/v1/av/auth/declarations/{id}/status': {
      get: {
        tags: ['4. Mes télédéclarations'],
        summary: 'Statut de paiement d\'une déclaration (polling)',
        description: `Retourne le statut de paiement temps réel d'une déclaration. **Utilisé pour le polling** toutes les 2 secondes après initiation d'un paiement Djomy.

### Algorithme de polling recommandé
\`\`\`
intervalle = 2 secondes
max_tentatives = 60  (→ 2 minutes max)

boucle:
  status = GET /declarations/{id}/status
  si status.is_paid == true → SUCCÈS, arrêter
  si status.djomy_status == "SUCCESS" ou "CAPTURED" → SUCCÈS, arrêter
  si status.djomy_status == "FAILED" → ÉCHEC, arrêter
  si tentatives >= max → TIMEOUT, afficher message d'attente
  attendre 2 secondes, réessayer
\`\`\`

### Interprétation de djomy_status
| Valeur | Action recommandée |
|--------|-------------------|
| \`null\` | Paiement pas encore initié |
| \`CREATED\` | Attendre — demande envoyée à Djomy |
| \`PENDING\` | Attendre — l'utilisateur doit valider sur son téléphone |
| \`AUTHORIZED\` | Attendre — capture en cours |
| \`SUCCESS\` / \`CAPTURED\` | ✅ Arrêter le polling — afficher succès |
| \`FAILED\` | ❌ Arrêter le polling — afficher erreur |`,
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer', example: 42 },
            description: 'ID de la déclaration (obtenu depuis `GET /declarations`)'
          }
        ],
        responses: {
          200: {
            description: 'Statut retourné',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DeclarationStatus' } } }
          },
          404: { description: 'Déclaration introuvable ou n\'appartient pas à l\'affilié connecté', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Token absent ou invalide' }
        }
      }
    },

    // ════════════════════════════════════════════════════
    // 5. PAIEMENT
    // ════════════════════════════════════════════════════

    '/api/v1/av/auth/djomy_cashin': {
      post: {
        tags: ['5. Paiement'],
        summary: 'Initier un paiement de déclaration via Djomy',
        description: `Initie un paiement de cotisation mensuelle via **Orange Money (OM)** ou **MTN MoMo (MOMO)**.

### Flux de paiement complet
\`\`\`
1. App → POST /djomy_cashin  (méthode + téléphone + declarationId)
           ↓
2. Backend → Djomy API  (authentification HMAC-SHA256 + requête paiement)
           ↓
3. Djomy → Téléphone utilisateur  (notification USSD : "Confirmez le paiement de X GNF")
           ↓
4. App → Poll GET /declarations/{id}/status  (toutes les 2 secondes)
           ↓
5. Djomy → Webhook /api/v1/webhook/djomy  (confirmation automatique)
           ↓
6. Déclaration marquée is_paid = true + quittance générée
\`\`\`

### Format du numéro de téléphone
Entrer **9 chiffres sans indicatif** (le backend ajoute automatiquement \`00224\`) :
- ✅ Correct : \`623707722\`
- ❌ Incorrect : \`00224623707722\` ou \`+224623707722\`

### Montant
Si \`amount\` est omis, le montant est lu automatiquement depuis l'affiliation (\`cotisation\`).

### Idempotence
Une déclaration déjà payée (\`is_paid: true\`) retourne une erreur 400. Vérifier \`is_paid\` avant d'appeler cet endpoint.`,
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['declarationId', 'paymentMethod', 'phone'],
                properties: {
                  declarationId: {
                    type: 'integer',
                    example: 42,
                    description: 'ID de la déclaration à payer — obtenu depuis `GET /declarations` (champ `id`). La déclaration doit appartenir à l\'affilié connecté et ne pas être déjà payée.'
                  },
                  paymentMethod: {
                    type: 'string',
                    enum: ['OM', 'MOMO'],
                    example: 'OM',
                    description: '**OM** = Orange Money Guinea | **MOMO** = MTN MoMo Guinea'
                  },
                  phone: {
                    type: 'string',
                    example: '623707722',
                    description: 'Numéro de téléphone du compte mobile money — **9 chiffres sans indicatif** (00224 ajouté automatiquement). Doit correspondre au numéro associé au compte OM ou MOMO.'
                  },
                  amount: {
                    type: 'integer',
                    example: 125000,
                    description: 'Montant en GNF. **Optionnel** — si absent, déduit depuis l\'affiliation (`cotisation`). Si fourni, doit être > 0.'
                  }
                }
              },
              examples: {
                'Orange Money': {
                  summary: 'Paiement Orange Money',
                  value: { declarationId: 42, paymentMethod: 'OM', phone: '623707722' }
                },
                'MTN MoMo avec montant': {
                  summary: 'Paiement MTN MoMo avec montant explicite',
                  value: { declarationId: 42, paymentMethod: 'MOMO', phone: '657001122', amount: 125000 }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Paiement initié — notification USSD envoyée sur le téléphone. Démarrer le polling sur `GET /declarations/{id}/status`.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DjomyResponse' } } }
          },
          400: {
            description: 'Requête invalide',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                examples: {
                  'Numéro invalide':     { value: { message: 'Numéro de téléphone invalide. Format attendu : 9 chiffres (ex: 623707722)' } },
                  'Déjà payée':          { value: { message: 'Cette déclaration est déjà payée' } },
                  'Méthode invalide':    { value: { message: 'Méthode de paiement invalide. Valeurs acceptées : OM, MOMO' } },
                  'Montant invalide':    { value: { message: 'Montant invalide' } },
                  'declarationId absent':{ value: { message: 'declarationId est obligatoire' } }
                }
              }
            }
          },
          404: { description: 'Déclaration introuvable ou n\'appartient pas à l\'affilié connecté', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          503: { description: 'Djomy non configuré sur le serveur (variables d\'environnement DJOMY_CLIENT_ID / DJOMY_CLIENT_SECRET manquantes)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          500: { description: 'Erreur lors de l\'appel à l\'API Djomy (réseau, credentials invalides, etc.)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/api/v1/webhook/djomy': {
      post: {
        tags: ['5. Paiement'],
        summary: 'Webhook Djomy — confirmation automatique de paiement',
        description: `⚠️ **Cet endpoint est appelé automatiquement par les serveurs Djomy.** Ne pas appeler depuis l'application mobile.

### Rôle
Djomy notifie ce endpoint dès qu'une transaction change de statut. Le backend :
1. Recherche la déclaration par \`transactionId\`
2. Met à jour \`djomy_status\`
3. Si statut \`SUCCESS\` ou \`CAPTURED\` → marque la déclaration \`is_paid = true\` et génère la quittance

### Comportement par statut
| Statut reçu | Action backend |
|-------------|---------------|
| \`SUCCESS\` | is_paid = true + génération quittance |
| \`CAPTURED\` | is_paid = true + génération quittance |
| \`FAILED\` | djomy_status = FAILED (pas de is_paid) |
| Autres | Mise à jour djomy_status uniquement |

### Idempotence
Si la déclaration est déjà payée (\`is_paid = true\`), le webhook ne la remet pas à jour.

### URL à configurer chez Djomy
\`https://av.cnss.gov.gn/api/v1/webhook/djomy\``,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    required: ['transactionId', 'status'],
                    properties: {
                      transactionId: { type: 'string', example: 'TXN-DJOMY-123456', description: 'Référence de la transaction Djomy' },
                      status:        { type: 'string', example: 'SUCCESS', enum: ['CREATED', 'PENDING', 'AUTHORIZED', 'SUCCESS', 'CAPTURED', 'FAILED'] }
                    }
                  }
                }
              },
              examples: {
                'Paiement confirmé':  { value: { data: { transactionId: 'TXN-DJOMY-123456', status: 'SUCCESS'  } } },
                'Paiement capturé':   { value: { data: { transactionId: 'TXN-DJOMY-123456', status: 'CAPTURED' } } },
                'Paiement échoué':    { value: { data: { transactionId: 'TXN-DJOMY-123456', status: 'FAILED'   } } }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Webhook reçu et traité (toujours 200 — même en cas d\'erreur interne pour éviter les retries Djomy)',
            content: { 'application/json': { schema: { type: 'object', properties: { received: { type: 'boolean', example: true } } } } }
          }
        }
      }
    },

    // ════════════════════════════════════════════════════
    // 6. MES DOCUMENTS
    // ════════════════════════════════════════════════════

    '/api/v1/av/auth/quittances': {
      get: {
        tags: ['6. Mes documents'],
        summary: 'Liste paginée de mes quittances de paiement',
        description: `Retourne la liste de toutes les quittances de l'affilié connecté.

### Génération automatique des quittances
Une quittance est **créée automatiquement** dès qu'une déclaration est payée :
- Via le webhook Djomy (statut SUCCESS ou CAPTURED)
- Via \`PATCH /declarations/{id}/pay\` (validation manuelle)

### Télécharger le PDF
Utiliser l'identifiant \`id\` retourné ici pour appeler :
\`GET /api/v1/av/auth/quittances/{id}/download\`

Le PDF est généré **à la volée** — aucun fichier n'est stocké sur le serveur.

### Tri
Les quittances sont triées par **date décroissante** (la plus récente en premier).`,
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1, minimum: 1 },
            description: 'Numéro de page'
          },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', default: 10, minimum: 1, maximum: 50 },
            description: 'Nombre de quittances par page (max 50)'
          }
        ],
        responses: {
          200: {
            description: 'Liste paginée des quittances',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Quittance' } } } }
                  ]
                },
                example: {
                  data: [
                    { id: 2, reference: 'AV-2024-000001-03-2026', periode: '03', year: 2026, montant: 125000, payment_method: 'DJOMY_OM',   djomy_transaction_id: 'TXN-001', createdAt: '2026-03-15T10:30:00.000Z' },
                    { id: 1, reference: 'AV-2024-000001-02-2026', periode: '02', year: 2026, montant: 5000,   payment_method: 'DJOMY_MOMO', djomy_transaction_id: 'TXN-002', createdAt: '2026-02-10T09:00:00.000Z' }
                  ],
                  totalItems: 2, totalPages: 1, currentPage: 1, pageSize: 10
                }
              }
            }
          },
          401: { description: 'Token absent ou invalide' },
          403: { description: 'Aucune affiliation associée au compte' }
        }
      }
    },

    '/api/v1/av/auth/quittances/{id}/download': {
      get: {
        tags: ['6. Mes documents'],
        summary: 'Télécharger le PDF d\'une quittance',
        description: `Génère et retourne le PDF de la quittance **à la volée** via Puppeteer.

**Aucun fichier n'est stocké sur le serveur** — le PDF est reconstruit à chaque appel depuis les données en base.

### Contenu du PDF
- En-tête officiel CNSS (logo, République de Guinée, drapeau)
- Informations de l'affilié (nom, prénom, N° immatriculation, adresse, profession)
- Tableau financier (montant payé, période, date de paiement, méthode, référence Djomy)
- Prestations souscrites avec taux
- QR Code de vérification
- Signature du Directeur Général

### Utilisation dans l'app mobile
\`\`\`
// Afficher le PDF dans un viewer
fetch('/api/v1/av/auth/quittances/1/download', {
  headers: { Authorization: 'Bearer <token>' }
})
.then(res => res.blob())
.then(blob => {
  const url = URL.createObjectURL(blob);
  // Afficher dans WebView ou ouvrir avec le viewer PDF
});
\`\`\``,
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer', example: 1 },
            description: 'ID de la quittance — obtenu depuis `GET /quittances` (champ `id`)'
          }
        ],
        responses: {
          200: {
            description: 'PDF de la quittance généré à la volée',
            headers: {
              'Content-Type':        { schema: { type: 'string', example: 'application/pdf' } },
              'Content-Disposition': { schema: { type: 'string', example: 'inline; filename="quittance-AV-2024-000001-02-2026.pdf"' } },
              'Content-Length':      { schema: { type: 'integer', description: 'Taille du PDF en octets' } }
            },
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } }
          },
          404: { description: 'Quittance introuvable ou n\'appartient pas à l\'affilié connecté', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          500: { description: 'Erreur lors de la génération du PDF (Puppeteer)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: 'Erreur lors de la génération du PDF' } } } },
          401: { description: 'Token absent ou invalide' }
        }
      }
    },

    '/api/v1/av/auth/documents': {
      get: {
        tags: ['6. Mes documents'],
        summary: 'Liste paginée des pièces jointes',
        description: `Retourne la liste des fichiers uploadés lors de la demande d'affiliation.

### Documents possibles
| Code | Libellé | Champ source |
|------|---------|-------------|
| \`CNI\` | Carte Nationale d'Identité | \`cni_file_path\` |
| \`PHOTO\` | Photo du demandeur | \`requester_picture\` |
| \`CERTIFICAT_RESIDENCE\` | Certificat de résidence | \`certificat_residence_file\` |

Seuls les documents effectivement uploadés apparaissent dans la liste (les champs null sont exclus).

### Télécharger un fichier
Utiliser l'URL contenue dans le champ \`url\` pour appeler \`GET /uploads/{filename}\`.`,
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1, minimum: 1 },
            description: 'Numéro de page'
          },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', default: 10, minimum: 1, maximum: 50 },
            description: 'Nombre de documents par page (max 50)'
          }
        ],
        responses: {
          200: {
            description: 'Liste des pièces jointes disponibles',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Document' } } } }
                  ]
                },
                example: {
                  data: [
                    { id: 1, code: 'CNI',                  label: "Carte Nationale d'Identité", url: '/uploads/cni-1234567890.jpg',   type: 'file' },
                    { id: 2, code: 'PHOTO',                label: 'Photo du demandeur',          url: '/uploads/photo-0987654321.jpg', type: 'file' },
                    { id: 3, code: 'CERTIFICAT_RESIDENCE', label: 'Certificat de résidence',     url: '/uploads/cert-1122334455.pdf',  type: 'file' }
                  ],
                  totalItems: 3, totalPages: 1, currentPage: 1, pageSize: 10
                }
              }
            }
          },
          403: { description: 'Aucune affiliation associée au compte' },
          404: { description: 'Affiliation non trouvée' },
          401: { description: 'Token absent ou invalide' }
        }
      }
    },

    '/uploads/{filename}': {
      get: {
        tags: ['6. Mes documents'],
        summary: 'Télécharger une pièce jointe',
        description: `Accès direct aux fichiers uploadés lors de la demande d'affiliation (CNI, photo, certificat de résidence).

Les chemins complets sont disponibles dans :
- \`GET /api/v1/av/auth/affiliation\` → champs \`cni_file_path\`, \`requester_picture\`, \`certificat_residence_file\`
- \`GET /api/v1/av/auth/documents\` → champ \`url\`

**Exemple :** si \`cni_file_path = "/uploads/cni-1234567890.jpg"\` → appeler \`GET /uploads/cni-1234567890.jpg\`

⚠️ Cet endpoint est statique (Express static). Pas d'authentification requise — les fichiers sont accessibles par URL directe.`,
        parameters: [
          {
            name: 'filename',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'cni-1234567890.jpg' },
            description: 'Nom du fichier avec extension (JPG, PNG, PDF)'
          }
        ],
        responses: {
          200: {
            description: 'Fichier retourné',
            content: {
              'image/jpeg': { schema: { type: 'string', format: 'binary' } },
              'image/png':  { schema: { type: 'string', format: 'binary' } },
              'application/pdf': { schema: { type: 'string', format: 'binary' } }
            }
          },
          404: { description: 'Fichier non trouvé' }
        }
      }
    }
  }
};

module.exports = swaggerSpec;
