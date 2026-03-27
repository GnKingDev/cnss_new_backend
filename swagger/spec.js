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
2. **Authentification** — Login, OTP, déconnexion
3. **Mon profil** — Détail de l'affiliation du connecté
4. **Mes télédéclarations** — Liste mensuelle des déclarations
5. **Paiement** — Paiement via Djomy (Orange Money / MTN MoMo)
6. **Mes documents** — Accès aux fichiers et pièces jointes

---

### Authentification
Les endpoints protégés nécessitent un token JWT :
\`\`\`
Authorization: Bearer <token>
\`\`\`
Obtenu via **POST /api/v1/av/auth/login** → **POST /api/v1/av/auth/verify_otp**.

### Format des montants
Tous les montants sont en **GNF (Franc Guinéen)**, entiers.

### Format du numéro de téléphone (paiement)
Entrer **9 chiffres** sans le préfixe pays (ex: \`623707722\`).
Le backend ajoute automatiquement \`00224\`.
    `,
    contact: { name: 'CNSS Guinée — Direction Informatique' }
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local' },
    { url: 'https://av.cnss.gov.gn', description: 'Production' }
  ],
  tags: [
    { name: '1. Demande', description: 'Simulation de cotisation et soumission d\'une demande d\'affiliation' },
    { name: '2. Authentification', description: 'Login, OTP, vérification de token, déconnexion, mot de passe' },
    { name: '3. Mon profil', description: 'Informations complètes de l\'affilié connecté' },
    { name: '4. Mes télédéclarations', description: 'Déclarations mensuelles — liste et statut de paiement' },
    { name: '5. Paiement', description: 'Initiation du paiement Djomy et suivi du statut' },
    { name: '6. Mes documents', description: 'Accès aux pièces jointes et documents PDF de l\'affilié' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token obtenu après login + validation OTP'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Erreur interne du serveur' }
        }
      },

      // ── Simulation ──
      SimulationInput: {
        type: 'object',
        required: ['revenu_annuel'],
        properties: {
          revenu_annuel: { type: 'integer', example: 12000000, description: 'Revenu annuel en GNF' },
          assurance_maladie: { type: 'boolean', example: true, description: 'Activer la prestation assurance maladie (6,5%)' },
          risque_professionnel: { type: 'boolean', example: true, description: 'Activer la prestation risque professionnel (6%)' },
          vieillesse: { type: 'boolean', example: false, description: 'Activer la prestation vieillesse (6,5%)' }
        }
      },
      SimulationResult: {
        type: 'object',
        properties: {
          revenu_annuel: { type: 'integer', example: 12000000 },
          revenu_mensuel: { type: 'integer', example: 1000000 },
          plafond: { type: 'integer', example: 1000000, description: 'Revenu mensuel plafonné (min 550 000 / max 2 500 000 GNF)' },
          cotisation: { type: 'integer', example: 125000, description: 'Cotisation mensuelle à payer en GNF' },
          montant_trimestriel: { type: 'integer', example: 375000, description: 'Cotisation × 3 mois' }
        }
      },

      // ── Profil affilié ──
      AffiliationVolontaire: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          nom: { type: 'string', example: 'Diallo' },
          prenom: { type: 'string', example: 'Mamadou' },
          date_naissance: { type: 'string', format: 'date', example: '1990-05-15' },
          lieu_naissance: { type: 'string', example: 'Conakry' },
          sexe: { type: 'string', enum: ['M', 'F'], example: 'M' },
          adresse: { type: 'string', example: 'Quartier Madina, Conakry' },
          phone_number: { type: 'string', example: '00224623707722' },
          email: { type: 'string', example: 'mamadou.diallo@email.com' },
          profession: { type: 'string', example: 'Commerçant' },
          no_immatriculation: { type: 'string', example: 'AV-2024-000001' },
          status: { type: 'string', example: 'Validé' },
          is_validated: { type: 'boolean', example: true },
          is_risque_professionnel_active: { type: 'boolean', example: true },
          risque_professionnel_percentage: { type: 'number', example: 0.06 },
          is_assurance_maladie_active: { type: 'boolean', example: true },
          assurance_maladie_percentage: { type: 'number', example: 0.065 },
          is_vieillesse_active: { type: 'boolean', example: false },
          vieillesse_percentage: { type: 'number', example: 0.065 },
          revenu_annuel: { type: 'integer', example: 12000000 },
          revenu_mensuel: { type: 'integer', example: 1000000 },
          plafond: { type: 'integer', example: 1000000 },
          cotisation: { type: 'integer', example: 125000, description: 'Montant mensuel à payer' },
          montant_trimestriel: { type: 'integer', example: 375000 },
          cni_file_path: { type: 'string', example: '/uploads/cni-1234567890.jpg', nullable: true },
          certificat_residence_file: { type: 'string', example: '/uploads/certificat-1234567890.jpg', nullable: true },
          requester_picture: { type: 'string', example: '/uploads/requester_picture-1234567890.jpg', nullable: true },
          branche: {
            type: 'object', nullable: true,
            properties: {
              id: { type: 'integer' },
              nom: { type: 'string', example: 'Branche Conakry' },
              code: { type: 'string', example: 'BCK' }
            }
          },
          prefecture: {
            type: 'object', nullable: true,
            properties: {
              id: { type: 'integer' },
              nom: { type: 'string', example: 'Conakry' },
              code: { type: 'string', example: 'CKY' }
            }
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },

      // ── Déclaration ──
      Declaration: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 42 },
          periode: { type: 'string', example: '02', description: 'Mois : "01" (Janvier) à "12" (Décembre)' },
          year: { type: 'integer', example: 2026 },
          montant_cotisation: { type: 'integer', example: 125000, description: 'Montant à payer pour ce mois (GNF)' },
          montant_soumis_cotisation: { type: 'integer', example: 1000000, description: 'Plafond mensuel soumis à cotisation' },
          revenu_annuel: { type: 'integer', example: 12000000 },
          revenu_mensuel: { type: 'integer', example: 1000000 },
          is_paid: { type: 'boolean', example: false, description: 'true = déclaration payée' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },

      // ── Statut paiement ──
      DeclarationStatus: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 42 },
          is_paid: { type: 'boolean', example: false },
          djomy_status: {
            type: 'string',
            nullable: true,
            example: 'PENDING',
            enum: ['CREATED', 'PENDING', 'AUTHORIZED', 'SUCCESS', 'CAPTURED', 'FAILED'],
            description: 'Dernier statut reçu de Djomy. null = paiement pas encore initié'
          },
          djomy_transaction_id: { type: 'string', nullable: true, example: 'TXN-DJOMY-123456' },
          payment_method: { type: 'string', nullable: true, example: 'DJOMY_OM' }
        }
      },

      // ── Réponse paiement ──
      DjomyResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Paiement initié. Validez la transaction sur votre téléphone.' },
          transactionId: { type: 'string', example: 'TXN-DJOMY-123456' },
          status: { type: 'string', example: 'CREATED' },
          redirectUrl: { type: 'string', nullable: true, description: 'URL de redirection si applicable' },
          paymentUrl: { type: 'string', nullable: true },
          merchantPaymentReference: { type: 'string', example: 'uuid-v4-ref' }
        }
      }
    }
  },

  paths: {

    // ════════════════════════════════════════════════════
    // 1. DEMANDE
    // ════════════════════════════════════════════════════

    '/affiliation-volontaire/simulation': {
      post: {
        tags: ['1. Demande'],
        summary: 'Simuler ma cotisation',
        description: `Calcule en temps réel la cotisation mensuelle selon le revenu et les prestations choisies.

**Règles de calcul :**
- Plafond = revenu mensuel borné entre **550 000** et **2 500 000** GNF
- Cotisation = Plafond × (somme des taux des prestations actives)
  - Assurance maladie : **6,5%**
  - Risque professionnel : **6%**
  - Vieillesse : **6,5%**

Aucune authentification requise.`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SimulationInput' },
              example: {
                revenu_annuel: 12000000,
                assurance_maladie: true,
                risque_professionnel: true,
                vieillesse: false
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Résultat de la simulation',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SimulationResult' } } }
          },
          400: { description: 'revenu_annuel manquant ou invalide', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/affiliation-volontaire/request_affiliation_volontaire': {
      post: {
        tags: ['1. Demande'],
        summary: 'Soumettre une demande d\'affiliation',
        description: `Crée une nouvelle demande d'affiliation volontaire avec les pièces jointes.

**Statut initial :** \`Nouveau\` — en attente de traitement par un agent CNSS.

Après validation par la CNSS, l'affilié reçoit son **numéro d'immatriculation** et ses identifiants de connexion.`,
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
                    description: 'Données de la demande en JSON stringifié',
                    example: JSON.stringify({
                      nom: 'Diallo',
                      prenom: 'Mamadou',
                      date_naissance: '1990-05-15',
                      lieu_naissance: 'Conakry',
                      sexe: 'M',
                      adresse: 'Quartier Madina, Conakry',
                      phone_number: '00224623707722',
                      email: 'mamadou.diallo@email.com',
                      profession: 'Commerçant',
                      revenu_annuel: 12000000,
                      is_assurance_maladie_active: true,
                      is_risque_professionnel_active: true,
                      is_vieillesse_active: false,
                      brancheId: 2,
                      prefectureId: 1
                    })
                  },
                  cni: {
                    type: 'string',
                    format: 'binary',
                    description: 'Photo de la CNI (recto ou recto-verso)'
                  },
                  requester_picture: {
                    type: 'string',
                    format: 'binary',
                    description: 'Photo du demandeur (portrait)'
                  },
                  certificat_residence: {
                    type: 'string',
                    format: 'binary',
                    description: 'Certificat de résidence'
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Demande soumise avec succès',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: "Demande d'affiliation volontaire soumise avec succès" }
                  }
                }
              }
            }
          },
          400: { description: 'Données invalides', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    // ════════════════════════════════════════════════════
    // 2. AUTHENTIFICATION
    // ════════════════════════════════════════════════════

    '/api/v1/av/auth/login': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Connexion — étape 1 (identifiants)',
        description: `Vérifie les identifiants. Si valides, envoie un **code OTP à 6 chiffres** par email et SMS.

Retourne un **token temporaire** (valide 30 min) à utiliser uniquement pour \`verify_otp\` et \`resend_otp\`.`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user_identify', 'password'],
                properties: {
                  user_identify: {
                    type: 'string',
                    example: 'AV-2024-000001',
                    description: 'Numéro d\'immatriculation ou adresse email'
                  },
                  password: { type: 'string', example: 'MonMotDePasse123' }
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
                    token: { type: 'string', description: 'Token temporaire pour l\'étape verify_otp' },
                    email: { type: 'string', example: 'ma***@email.com', description: 'Email masqué où l\'OTP a été envoyé' },
                    phone_number: { type: 'string', example: '002246237***22', description: 'Téléphone masqué où l\'OTP a été envoyé' }
                  }
                }
              }
            }
          },
          400: { description: 'Mot de passe ou identification incorrecte', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/api/v1/av/auth/verify_otp': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Connexion — étape 2 (validation OTP)',
        description: `Valide le code OTP reçu par email/SMS.

En cas de succès retourne le **token de session JWT** principal à utiliser pour tous les autres appels.

Si c'est la **première connexion**, retourne \`first_login: true\` — l'utilisateur doit d'abord changer son mot de passe via \`resete_password_first_login\`.`,
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code'],
                properties: {
                  code: { type: 'string', example: '123456', description: 'Code OTP à 6 chiffres reçu par email/SMS' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'OTP validé',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', description: 'Token JWT de session — à conserver et envoyer dans Authorization: Bearer <token>' },
                    first_login: { type: 'boolean', example: false, description: 'Si true : rediriger vers le changement de mot de passe' },
                    message: { type: 'string', nullable: true, example: 'Première connexion. Veuillez changer votre mot de passe.' }
                  }
                }
              }
            }
          },
          400: { description: 'Code OTP incorrect ou expiré', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/api/v1/av/auth/resend_otp': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Renvoyer le code OTP',
        description: 'Génère et renvoie un nouveau code OTP par email et SMS. Nécessite le **token temporaire** du login.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Code renvoyé',
            content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'Code renvoyé' } } } } }
          }
        }
      }
    },

    '/api/v1/av/auth/verify_token': {
      get: {
        tags: ['2. Authentification'],
        summary: 'Vérifier le token de session',
        description: 'Vérifie si le token est encore valide et retourne le profil utilisateur. Utile au démarrage de l\'app pour vérifier si la session est active.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Token valide',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Token valide' },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        user_identify: { type: 'string' },
                        type: { type: 'string', example: 'av' },
                        role: { type: 'string', example: 'av' },
                        affiliationVolontaire: { $ref: '#/components/schemas/AffiliationVolontaire' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: 'Token invalide ou expiré — relancer le login' }
        }
      }
    },

    '/api/v1/av/auth/signOut': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Déconnexion',
        description: 'Invalide la session Redis. Le token devient inutilisable.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Déconnecté', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'Déconnexion réussie' } } } } } }
        }
      }
    },

    '/api/v1/av/auth/verify_imma_send_otp': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Mot de passe oublié — étape 1',
        description: 'Envoie un OTP à partir du numéro d\'immatriculation. Retourne un token temporaire pour les étapes suivantes.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['immatriculation'],
                properties: {
                  immatriculation: { type: 'string', example: 'AV-2024-000001' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'OTP envoyé',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', description: 'Token temporaire pour verify_otp_reset' },
                    email: { type: 'string', nullable: true },
                    phone_number: { type: 'string', nullable: true }
                  }
                }
              }
            }
          },
          400: { description: 'Immatriculation introuvable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/api/v1/av/auth/verify_otp_reset': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Mot de passe oublié — étape 2 (valider OTP)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code'],
                properties: { code: { type: 'string', example: '654321' } }
              }
            }
          }
        },
        responses: {
          200: { description: 'OTP valide — passer à l\'étape reset_password_forgot', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'ok' } } } } } },
          400: { description: 'Code OTP expiré ou incorrect', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/api/v1/av/auth/reset_password_forgot': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Mot de passe oublié — étape 3 (nouveau mot de passe)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['imma', 'new_password'],
                properties: {
                  imma: { type: 'string', example: 'AV-2024-000001' },
                  new_password: { type: 'string', example: 'NouveauMDP2024!' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Mot de passe réinitialisé — l\'utilisateur peut se reconnecter', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'Mot de passe réinitialisé avec succès' } } } } } },
          404: { description: 'Utilisateur introuvable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/api/v1/av/auth/resete_password_first_login': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Changer le mot de passe — première connexion',
        description: 'Obligatoire quand \`first_login: true\`. Nécessite le token first_login retourné par verify_otp.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user_password', 'new_password'],
                properties: {
                  user_password: { type: 'string', description: 'Mot de passe temporaire fourni par la CNSS' },
                  new_password: { type: 'string', description: 'Nouveau mot de passe choisi par l\'utilisateur' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Mot de passe modifié — relancer le login', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'Mot de passe modifié avec succès' } } } } } },
          400: { description: 'Mot de passe temporaire incorrect', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/api/v1/av/auth/resete_password': {
      post: {
        tags: ['2. Authentification'],
        summary: 'Changer son mot de passe (connecté)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password', 'new_password'],
                properties: {
                  password: { type: 'string', description: 'Mot de passe actuel' },
                  new_password: { type: 'string', description: 'Nouveau mot de passe' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Mot de passe modifié', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'Mot de passe modifié avec succès' } } } } } },
          400: { description: 'Mot de passe actuel incorrect', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    // ════════════════════════════════════════════════════
    // 3. MON PROFIL
    // ════════════════════════════════════════════════════

    '/api/v1/av/auth/affiliation': {
      get: {
        tags: ['3. Mon profil'],
        summary: 'Détail complet de mon affiliation',
        description: `Retourne toutes les informations de l'affilié connecté :
- Données personnelles (nom, prénom, date de naissance, adresse…)
- Prestations souscrites et leurs taux
- Montant de cotisation mensuelle
- Branche et préfecture rattachées
- Statut de validation`,
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Profil complet',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AffiliationVolontaire' } } }
          },
          403: { description: 'Aucune affiliation associée à ce compte' },
          404: { description: 'Affiliation non trouvée' }
        }
      }
    },

    // ════════════════════════════════════════════════════
    // 4. MES TÉLÉDÉCLARATIONS
    // ════════════════════════════════════════════════════

    '/api/v1/av/auth/declarations': {
      get: {
        tags: ['4. Mes télédéclarations'],
        summary: 'Liste de mes déclarations mensuelles',
        description: `Retourne les déclarations mensuelles de l'affilié pour les **12 derniers mois**.

Les déclarations sont **générées automatiquement** — une ligne par mois — si elles n'existent pas encore.

**Tableau des périodes :** \`"01"\` = Janvier, \`"02"\` = Février, … \`"12"\` = Décembre.`,
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1 },
            description: 'Numéro de page'
          },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', default: 5, maximum: 50 },
            description: 'Nombre de déclarations par page'
          }
        ],
        responses: {
          200: {
            description: 'Liste paginée des déclarations',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Declaration' }
                    },
                    totalItems: { type: 'integer', example: 12 },
                    totalPages: { type: 'integer', example: 3 },
                    currentPage: { type: 'integer', example: 1 },
                    pageSize: { type: 'integer', example: 5 }
                  }
                }
              }
            }
          }
        }
      }
    },

    '/api/v1/av/auth/declarations/{id}/status': {
      get: {
        tags: ['4. Mes télédéclarations'],
        summary: 'Statut de paiement d\'une déclaration',
        description: `Retourne le statut de paiement d'une déclaration spécifique.

Utilisé pour **poller** (vérifier toutes les 2 secondes) après initiation d'un paiement, jusqu'à confirmation ou échec.

**Statuts Djomy :**
| Statut | Signification |
|--------|---------------|
| \`null\` | Paiement pas encore initié |
| \`CREATED\` | Demande créée chez Djomy |
| \`PENDING\` | En attente de validation |
| \`AUTHORIZED\` | Autorisé, pas encore capturé |
| \`SUCCESS\` | **Paiement confirmé** |
| \`CAPTURED\` | **Paiement confirmé** |
| \`FAILED\` | Paiement échoué |`,
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'ID de la déclaration'
          }
        ],
        responses: {
          200: {
            description: 'Statut de la déclaration',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DeclarationStatus' } } }
          },
          404: { description: 'Déclaration non trouvée ou n\'appartient pas à cet affilié' }
        }
      }
    },

    // ════════════════════════════════════════════════════
    // 5. PAIEMENT
    // ════════════════════════════════════════════════════

    '/api/v1/av/auth/djomy_cashin': {
      post: {
        tags: ['5. Paiement'],
        summary: 'Payer une déclaration via Djomy',
        description: `Initie un paiement via **Orange Money (OM)** ou **MTN MoMo (MOMO)**.

**Flux complet :**
1. Appeler cet endpoint avec la méthode et le numéro de téléphone
2. L'affilié reçoit une **notification USSD** sur son téléphone
3. Il valide le paiement sur son téléphone
4. Poller \`GET /declarations/{id}/status\` toutes les **2 secondes**
5. Quand \`is_paid: true\` ou \`djomy_status: "SUCCESS"\` → paiement confirmé

**Format du numéro :** Entrer **9 chiffres** sans indicatif (ex: \`623707722\`).
Le \`00224\` est ajouté automatiquement par le backend.`,
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
                    description: 'ID de la déclaration à payer (obtenu depuis GET /declarations)'
                  },
                  paymentMethod: {
                    type: 'string',
                    enum: ['OM', 'MOMO'],
                    example: 'OM',
                    description: 'OM = Orange Money | MOMO = MTN MoMo'
                  },
                  phone: {
                    type: 'string',
                    example: '623707722',
                    description: '9 chiffres sans le préfixe 00224'
                  },
                  amount: {
                    type: 'integer',
                    example: 125000,
                    description: 'Optionnel — si absent, le montant est déduit automatiquement depuis l\'affiliation'
                  }
                }
              },
              examples: {
                'Orange Money': {
                  value: { declarationId: 42, paymentMethod: 'OM', phone: '623707722' }
                },
                'MTN MoMo': {
                  value: { declarationId: 42, paymentMethod: 'MOMO', phone: '657001122' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Paiement initié — notification USSD envoyée sur le téléphone',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/DjomyResponse' } } }
          },
          400: {
            description: 'Données invalides',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                examples: {
                  'Numéro invalide': { value: { message: 'Numéro de téléphone invalide. Format attendu : 9 chiffres (ex: 623707722)' } },
                  'Déjà payée': { value: { message: 'Cette déclaration est déjà payée' } },
                  'Méthode invalide': { value: { message: 'Méthode de paiement invalide. Valeurs acceptées : OM, MOMO' } }
                }
              }
            }
          },
          404: { description: 'Déclaration non trouvée', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          503: { description: 'Service Djomy non configuré', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/api/v1/webhook/djomy': {
      post: {
        tags: ['5. Paiement'],
        summary: 'Webhook Djomy — confirmation de paiement',
        description: `⚠️ **Cet endpoint est appelé automatiquement par Djomy**, pas par l'application mobile.

Djomy notifie ce endpoint quand le statut d'une transaction change :
- \`SUCCESS\` / \`CAPTURED\` → la déclaration est marquée **payée** (\`is_paid: true\`)
- \`FAILED\` → statut mis à jour, paiement échoué
- Autres → mise à jour du statut uniquement

**URL à configurer chez Djomy :** \`https://av.cnss.gov.gn/api/v1/webhook/djomy\``,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      transactionId: { type: 'string', example: 'TXN-DJOMY-123456' },
                      status: {
                        type: 'string',
                        enum: ['CREATED', 'PENDING', 'AUTHORIZED', 'SUCCESS', 'CAPTURED', 'FAILED'],
                        example: 'SUCCESS'
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Webhook reçu et traité',
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
        description: `Retourne la liste des quittances enregistrées automatiquement à chaque déclaration payée.

Une quittance est créée dès que le paiement est confirmé (webhook Djomy ou validation manuelle).

Pour télécharger le PDF d'une quittance, utiliser **GET /quittances/{id}/download** avec l'identifiant \`id\` retourné ici. Le PDF est généré à la volée — aucun fichier n'est stocké sur le serveur.`,
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 10, maximum: 50 } }
        ],
        responses: {
          200: {
            description: 'Liste paginée des quittances',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'integer', example: 1, description: 'Utiliser cet ID pour télécharger le PDF via GET /quittances/{id}/download' },
                          reference: { type: 'string', example: 'AV-2024-000001-02-2026' },
                          periode: { type: 'string', example: '02', description: 'Mois : "01" à "12"' },
                          year: { type: 'integer', example: 2026 },
                          montant: { type: 'integer', example: 125000, description: 'Montant payé en GNF' },
                          payment_method: { type: 'string', example: 'DJOMY_OM', description: 'DJOMY_OM = Orange Money | DJOMY_MOMO = MTN MoMo' },
                          djomy_transaction_id: { type: 'string', example: 'TXN-DJOMY-123456', nullable: true },
                          createdAt: { type: 'string', format: 'date-time' }
                        }
                      }
                    },
                    totalItems: { type: 'integer', example: 5 },
                    totalPages: { type: 'integer', example: 1 },
                    currentPage: { type: 'integer', example: 1 },
                    pageSize: { type: 'integer', example: 10 }
                  }
                }
              }
            }
          }
        }
      }
    },

    '/api/v1/av/auth/quittances/{id}/download': {
      get: {
        tags: ['6. Mes documents'],
        summary: 'Télécharger le PDF d\'une quittance',
        description: `Génère et retourne le PDF de la quittance **à la volée** (aucun fichier stocké sur le serveur).

Le PDF est reconstruit à chaque appel depuis les données en base : informations de l'affilié, période, montant, prestations souscrites, référence de transaction Djomy, signature du Directeur Général.

**Format de réponse :** \`application/pdf\` — à afficher directement dans l'app ou à proposer en téléchargement.`,
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID de la quittance (obtenu via GET /quittances)' }
        ],
        responses: {
          200: {
            description: 'PDF de la quittance généré à la volée',
            headers: {
              'Content-Disposition': { schema: { type: 'string', example: 'inline; filename="quittance-AV-2024-000001-02-2026.pdf"' } },
              'Content-Type': { schema: { type: 'string', example: 'application/pdf' } }
            },
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } }
          },
          404: { description: 'Quittance non trouvée', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          500: { description: 'Erreur lors de la génération du PDF', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
      }
    },

    '/api/v1/av/auth/documents': {
      get: {
        tags: ['6. Mes documents'],
        summary: 'Liste paginée de mes documents',
        description: `Retourne la liste des pièces jointes disponibles pour l'affilié connecté.

**Documents possibles :**
| Code | Description |
|------|-------------|
| \`CNI\` | Carte Nationale d'Identité |
| \`PHOTO\` | Photo du demandeur |
| \`CERTIFICAT_RESIDENCE\` | Certificat de résidence |

Seuls les documents effectivement uploadés lors de la demande apparaissent dans la liste.
Le champ \`url\` contient le chemin à utiliser pour télécharger le fichier via \`GET /uploads/{filename}\`.`,
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', default: 1 },
            description: 'Numéro de page'
          },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', default: 10, maximum: 50 },
            description: 'Nombre de documents par page'
          }
        ],
        responses: {
          200: {
            description: 'Liste paginée des documents',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'integer', example: 1 },
                          code: { type: 'string', example: 'CNI', enum: ['CNI', 'PHOTO', 'CERTIFICAT_RESIDENCE'] },
                          label: { type: 'string', example: "Carte Nationale d'Identité" },
                          url: { type: 'string', example: '/uploads/cni-1234567890.jpg', description: 'Chemin à appeler pour télécharger le fichier' },
                          type: { type: 'string', example: 'file' }
                        }
                      }
                    },
                    totalItems: { type: 'integer', example: 3 },
                    totalPages: { type: 'integer', example: 1 },
                    currentPage: { type: 'integer', example: 1 },
                    pageSize: { type: 'integer', example: 10 }
                  }
                },
                example: {
                  data: [
                    { id: 1, code: 'CNI', label: "Carte Nationale d'Identité", url: '/uploads/cni-1234567890.jpg', type: 'file' },
                    { id: 2, code: 'PHOTO', label: 'Photo du demandeur', url: '/uploads/requester_picture-0987654321.jpg', type: 'file' },
                    { id: 3, code: 'CERTIFICAT_RESIDENCE', label: 'Certificat de résidence', url: '/uploads/certificat-1122334455.pdf', type: 'file' }
                  ],
                  totalItems: 3,
                  totalPages: 1,
                  currentPage: 1,
                  pageSize: 10
                }
              }
            }
          },
          403: { description: 'Aucune affiliation associée à ce compte' },
          404: { description: 'Affiliation non trouvée' }
        }
      }
    },

    '/uploads/{filename}': {
      get: {
        tags: ['6. Mes documents'],
        summary: 'Télécharger une pièce jointe',
        description: `Accès direct aux fichiers uploadés lors de la demande d'affiliation.

Les chemins sont retournés dans le profil de l'affilié (\`GET /api/v1/av/auth/affiliation\`) dans les champs :
- \`cni_file_path\` → Photo de la CNI
- \`requester_picture\` → Photo du demandeur
- \`certificat_residence_file\` → Certificat de résidence

**Exemple :** si \`cni_file_path = "/uploads/cni-1234567890.jpg"\`, appeler \`GET /uploads/cni-1234567890.jpg\`.`,
        parameters: [
          {
            name: 'filename',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Nom du fichier (ex: cni-1234567890.jpg)',
            example: 'cni-1234567890.jpg'
          }
        ],
        responses: {
          200: {
            description: 'Fichier retourné',
            content: {
              'image/jpeg': { schema: { type: 'string', format: 'binary' } },
              'image/png': { schema: { type: 'string', format: 'binary' } },
              'application/pdf': { schema: { type: 'string', format: 'binary' } }
            }
          },
          404: { description: 'Fichier non trouvé' }
        }
      }
    },

    '/api/v1/docsx/{filename}': {
      get: {
        tags: ['6. Mes documents'],
        summary: 'Télécharger un document PDF officiel',
        description: `Accès aux documents PDF générés par la CNSS (attestations, quittances, etc.).

Retourne le PDF directement dans le navigateur ou peut être téléchargé.

**Sécurité :** Le nom de fichier est validé (extension .pdf obligatoire, pas de traversée de répertoire).`,
        parameters: [
          {
            name: 'filename',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Nom du fichier PDF',
            example: 'attestation-AV-2024-000001.pdf'
          }
        ],
        responses: {
          200: {
            description: 'Document PDF',
            content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } }
          },
          400: { description: 'Nom de fichier invalide (doit être .pdf)' },
          404: { description: 'Document non trouvé' }
        }
      }
    }
  }
};

module.exports = swaggerSpec;
