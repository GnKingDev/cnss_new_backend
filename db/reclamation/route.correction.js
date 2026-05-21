/**
 * Routes DIRGA — Corrections directes (l'employeur est au guichet).
 * Différence avec les réclamations : la correction est appliquée immédiatement, pas de workflow.
 * Référence : COR-YYYY-NNN
 *
 * POST /bo/corrections         — créer et appliquer une correction
 * GET  /bo/corrections         — liste paginée des corrections DIRGA
 * GET  /bo/corrections/:id     — détail d'une correction
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const { Op } = require('sequelize');
const ReclamationDemande = require('./model');
const Employeur = require('../XYemployeurs/model');
const Employe = require('../employe/model');
const Document = require('../document/model');
const CotisationEmployeur = require('../cotisation_employeur/model');
const Quittance = require('../quittance/model');
const cotisationUtil = require('../cotisation_employeur/utility');
const Users = require('../users/model');

let generatedNotification;
try { generatedNotification = require('../../utility').generatedNotification; } catch { generatedNotification = null; }

let sendMailEmployeurValidation, genereQuittance, sendMailSuccesfulPaiement;
try {
  const u2 = require('../../utility2');
  sendMailEmployeurValidation = u2.sendMailEmployeurValidation || (() => Promise.resolve());
  genereQuittance = u2.genereQuittance || (() => Promise.resolve());
  sendMailSuccesfulPaiement = u2.sendMailSuccesfulPaiement || (() => Promise.resolve());
} catch {
  sendMailEmployeurValidation = () => Promise.resolve();
  genereQuittance = () => Promise.resolve();
  sendMailSuccesfulPaiement = () => Promise.resolve();
}

const { paylican_token, paylican_create_company } = (() => {
  try { return require('../XYemployeurs/utility'); } catch { return { paylican_token: null, paylican_create_company: null }; }
})();

const TYPE_LABELS = {
  notification: "Notification d'immatriculation",
  correction_naissance: 'Correction date de naissance',
  correction_genre: 'Correction de genre',
  changement_raison_sociale: 'Changement de raison sociale',
  annulation: 'Annulation de déclaration',
  quittance: 'Génération de quittance',
  changement_contact: 'Changement téléphone / email',
};

const CORRECTION_TYPES = Object.keys(TYPE_LABELS);

async function getNextCorrectionRef(employeurId) {
  const year = new Date().getFullYear();
  const prefix = `COR-${year}-`;
  const last = await ReclamationDemande.findOne({
    where: { reference: { [Op.like]: `${prefix}%` }, employeur_id: employeurId },
    order: [['id', 'DESC']],
    attributes: ['reference'],
  });
  const lastNum = last?.reference ? parseInt(last.reference.replace(prefix, ''), 10) || 0 : 0;
  return `${prefix}${String(lastNum + 1).padStart(3, '0')}`;
}

function formatDate(d) {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

// ── GET /bo/corrections/users/search?identity=xxx ─────────────────────────────
router.get('/users/search', async (req, res) => {
  try {
    const { identity } = req.query;
    if (!identity || !String(identity).trim()) {
      return res.status(400).json({ success: false, message: 'Paramètre identity requis' });
    }
    const users = await Users.findAll({
      where: { identity: { [Op.like]: `%${String(identity).trim()}%` } },
      attributes: ['id', 'identity', 'user_identify', 'full_name', 'email', 'phone_number', 'role', 'type'],
      limit: 20,
    });
    return res.status(200).json({ success: true, data: users });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /bo/corrections ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { type, employeur_id, employe_id, nouvelle_valeur, user_identity } = req.body || {};

    if (!CORRECTION_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: `Type invalide. Types acceptés : ${CORRECTION_TYPES.join(', ')}` });
    }
    if (!employeur_id) {
      return res.status(400).json({ success: false, message: 'employeur_id requis' });
    }
    if (!nouvelle_valeur || !String(nouvelle_valeur).trim()) {
      return res.status(400).json({ success: false, message: 'nouvelle_valeur requise' });
    }
    if (['correction_naissance', 'correction_genre'].includes(type) && !employe_id) {
      return res.status(400).json({ success: false, message: 'employe_id requis pour ce type de correction' });
    }
    if (type === 'changement_contact' && !user_identity) {
      return res.status(400).json({ success: false, message: 'user_identity requis pour ce type de correction' });
    }

    const employeur = await Employeur.findByPk(employeur_id);
    if (!employeur) return res.status(404).json({ success: false, message: 'Employeur introuvable' });

    let employe = null;
    if (employe_id) {
      employe = await Employe.findByPk(employe_id);
      if (!employe) return res.status(404).json({ success: false, message: 'Employé introuvable' });
    }

    const reference = await getNextCorrectionRef(employeur_id);
    let libelle = TYPE_LABELS[type];
    let description = '';
    let ancienneValeur = '';

    // ── Appliquer la correction selon le type ──────────────────────────────────

    if (type === 'changement_raison_sociale') {
      ancienneValeur = employeur.raison_sociale || '';
      description = `Ancienne raison sociale : ${ancienneValeur} | Nouvelle raison sociale : ${nouvelle_valeur.trim()}`;
      libelle = `Changement raison sociale → ${nouvelle_valeur.trim().substring(0, 60)}`;

      employeur.raison_sociale = nouvelle_valeur.trim();
      await employeur.save();

      // Sync Paylican
      if (paylican_token && paylican_create_company) {
        paylican_token()
          .then((token) => paylican_create_company(employeur, token, employeur.no_immatriculation))
          .catch((e) => console.error('[CORRECTION_DIRGA] Paylican:', e.message));
      }
    }

    else if (type === 'correction_naissance') {
      // nouvelle_valeur = nouvelle date de naissance (DD/MM/YYYY ou YYYY-MM-DD)
      const dateStr = String(nouvelle_valeur).trim();
      let nouvelleDate;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('/');
        nouvelleDate = new Date(`${year}-${month}-${day}`);
      } else {
        nouvelleDate = new Date(dateStr);
      }
      if (isNaN(nouvelleDate.getTime())) {
        return res.status(400).json({ success: false, message: `Date invalide : "${dateStr}". Format attendu : DD/MM/YYYY` });
      }

      ancienneValeur = formatDate(employe.date_of_birth) || 'N/A';
      const ancienImmat = employe.no_immatriculation || '';
      const newYear = nouvelleDate.getUTCFullYear().toString();
      const newMonth = String(nouvelleDate.getUTCMonth() + 1).padStart(2, '0');
      const newDatePart = `${newYear[2]}${newYear[3]}${newMonth}`;
      const newImmat = ancienImmat.length >= 5
        ? `${ancienImmat[0]}${newDatePart}${ancienImmat.slice(5)}`
        : ancienImmat;

      description = [
        `Employé : ${employe.last_name} ${employe.first_name}`,
        `Matricule : ${employe.matricule || 'N/A'}`,
        `Ancienne date de naissance : ${ancienneValeur}`,
        `Nouvelle date de naissance : ${formatDate(nouvelleDate)}`,
        `Ancien N° immat : ${ancienImmat}`,
        `Nouveau N° immat : ${newImmat}`,
      ].join(' | ');

      libelle = `Correction naissance — ${employe.last_name} ${employe.first_name} : ${ancienneValeur} → ${formatDate(nouvelleDate)}`;

      await employe.update({ date_of_birth: nouvelleDate, no_immatriculation: newImmat });
    }

    else if (type === 'correction_genre') {
      const genre = String(nouvelle_valeur).toUpperCase().trim();
      if (!['M', 'F'].includes(genre)) {
        return res.status(400).json({ success: false, message: 'Genre invalide : M ou F attendu' });
      }
      ancienneValeur = employe.gender || 'N/A';
      const ancienImmat = employe.no_immatriculation || '';
      const newImmat = ancienImmat.length >= 1
        ? `${genre === 'M' ? '1' : '2'}${ancienImmat.slice(1)}`
        : ancienImmat;

      description = [
        `Employé : ${employe.last_name} ${employe.first_name}`,
        `Matricule : ${employe.matricule || 'N/A'}`,
        `Ancien genre : ${ancienneValeur}`,
        `Nouveau genre : ${genre}`,
        `Ancien N° immat : ${ancienImmat}`,
        `Nouveau N° immat : ${newImmat}`,
      ].join(' | ');

      libelle = `Correction genre — ${employe.last_name} ${employe.first_name} : ${ancienneValeur} → ${genre}`;

      await employe.update({ gender: genre, no_immatriculation: newImmat });
    }

    else if (type === 'annulation') {
      // nouvelle_valeur = cotisation_id
      const cotisationId = parseInt(String(nouvelle_valeur).trim(), 10);
      if (isNaN(cotisationId)) {
        return res.status(400).json({ success: false, message: 'nouvelle_valeur doit être l\'ID de la déclaration à annuler' });
      }
      const cotisation = await CotisationEmployeur.findOne({ where: { id: cotisationId, employeurId: employeur_id } });
      if (!cotisation) return res.status(404).json({ success: false, message: 'Déclaration introuvable pour cet employeur' });
      if (cotisation.is_paid) return res.status(400).json({ success: false, message: 'Impossible d\'annuler une déclaration déjà payée' });

      const periode = cotisation.periode || `${cotisation.year}`;
      description = `Annulation déclaration ID:${cotisationId} — Période: ${periode} — Montant: ${cotisation.total_cotisation || 0} GNF`;
      libelle = `Annulation déclaration — ${periode}`;
      ancienneValeur = String(cotisationId);

      await cotisation.destroy();
    }

    else if (type === 'quittance') {
      // nouvelle_valeur = cotisation_id
      const cotisationId = parseInt(String(nouvelle_valeur).trim(), 10);
      if (isNaN(cotisationId)) {
        return res.status(400).json({ success: false, message: 'nouvelle_valeur doit être l\'ID de la déclaration payée' });
      }
      const cotisation = await CotisationEmployeur.findOne({ where: { id: cotisationId, employeurId: employeur_id } });
      if (!cotisation) return res.status(404).json({ success: false, message: 'Déclaration introuvable pour cet employeur' });
      if (!cotisation.is_paid) return res.status(400).json({ success: false, message: 'La déclaration n\'est pas encore payée' });

      const { generateUniqueCode } = require('../users/utility');
      const codeUnique = generateUniqueCode(9);
      const periode = cotisation.periode || String(cotisation.year);
      const fileName = `Quittance-cor-${employeur.no_immatriculation}-${periode}-${codeUnique}`;

      // Trouver le nom de la période lisible
      const monthInfo = (cotisationUtil.MONTHS || []).find((m) => m.code === String(cotisation.periode || '').padStart(2, '0'));
      const periodeReadable = monthInfo
        ? `${monthInfo.name.charAt(0) + monthInfo.name.slice(1).toLowerCase()} ${cotisation.year}`
        : `${periode} ${cotisation.year || ''}`.trim();

      const fakePaiement = {
        employeur,
        Employeur: employeur,
        cotisation_employeur: cotisation,
        cotisationEmployeur: cotisation,
        paiement_date: cotisation.paid_date || new Date(),
        bank_name: '-',
      };

      try {
        await genereQuittance(fakePaiement, periode, fileName, codeUnique, periodeReadable, '01', '-');
      } catch (pdfErr) {
        console.error('[CORRECTION_DIRGA] Quittance PDF:', pdfErr.message);
      }

      const docPath = `/api/v1/docsx/${fileName}.pdf`;
      await Document.create({ name: `Quittance-${periodeReadable}`, path: docPath, code: codeUnique, employeurId: employeur.id });
      await Quittance.create({
        reference: `${employeur.no_immatriculation || ''}${periode}COR`,
        secret_code: codeUnique,
        doc_path: docPath,
        employeurId: employeur.id,
        cotisation_employeurId: cotisation.id,
        paiementId: null,
      }).catch((e) => console.warn('[CORRECTION_DIRGA] Quittance create:', e.message));

      try { await sendMailSuccesfulPaiement(fakePaiement, periodeReadable, fileName); } catch (e) { console.error('[CORRECTION_DIRGA] Mail quittance:', e.message); }

      description = `Quittance générée — Période: ${periodeReadable} — Déclaration ID:${cotisationId} — Réf: ${fileName}`;
      libelle = `Quittance — ${periodeReadable}`;
    }

    else if (type === 'changement_contact') {
      // user_identity = identity du compte user à modifier
      // nouvelle_valeur = JSON {"email":"...","phone":"..."}
      const targetUser = await Users.findOne({ where: { identity: String(user_identity).trim() } });
      if (!targetUser) {
        return res.status(404).json({ success: false, message: `Aucun utilisateur trouvé avec l'identifiant : ${user_identity}` });
      }

      let updates;
      try {
        updates = JSON.parse(String(nouvelle_valeur));
      } catch {
        return res.status(400).json({ success: false, message: 'nouvelle_valeur doit être un JSON valide : {"email":"...","phone":"..."}' });
      }

      const ancienEmail = targetUser.email || 'N/A';
      const ancienTel = targetUser.phone_number || 'N/A';

      const updateData = {};
      if (updates.email && String(updates.email).trim()) updateData.email = String(updates.email).trim();
      if (updates.phone && String(updates.phone).trim()) updateData.phone_number = String(updates.phone).trim();

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ success: false, message: 'Aucune valeur à mettre à jour (email ou phone requis)' });
      }

      await targetUser.update(updateData);

      description = [
        `Utilisateur : ${targetUser.full_name || targetUser.user_identify || user_identity}`,
        `Identifiant : ${targetUser.identity}`,
        `Ancien email : ${ancienEmail}`,
        `Nouvel email : ${updateData.email || ancienEmail}`,
        `Ancien téléphone : ${ancienTel}`,
        `Nouveau téléphone : ${updateData.phone_number || ancienTel}`,
      ].join(' | ');

      libelle = `Contact mis à jour — ${targetUser.full_name || targetUser.identity}`;
    }

    else if (type === 'notification') {
      description = `Régénération notification d'immatriculation — ${employeur.raison_sociale} (${employeur.no_immatriculation})`;
      libelle = `Notification d'immatriculation — ${employeur.raison_sociale}`;

      // Générer le PDF
      if (generatedNotification) {
        try {
          const { generateUniqueCode } = require('../users/utility');
          const code = generateUniqueCode(9);
          const notifName = `immatriculation-cor-${Date.now()}-${employeur.id}`;
          const filePath = await generatedNotification(notifName, employeur, code);
          const docPath = `/api/v1/docsx/${notifName}.pdf`;

          await Document.create({
            name: "Notification d'immatriculation",
            path: docPath,
            employeurId: employeur.id,
            code,
          });

          description += ` | PDF: ${notifName}.pdf`;

          try {
            await sendMailEmployeurValidation(employeur.email, employeur, null, filePath);
          } catch (mailErr) {
            console.error('[CORRECTION_DIRGA] Email notification:', mailErr.message);
          }
        } catch (pdfErr) {
          console.error('[CORRECTION_DIRGA] Génération PDF notification:', pdfErr.message);
        }
      }
    }

    // ── Enregistrer la correction (statut approved immédiatement) ──────────────
    const correction = await ReclamationDemande.create({
      employeur_id,
      reference,
      type,
      libelle,
      status: 'approved',
      progress: 100,
      description,
      date_response: new Date(),
    });

    console.log(`[CORRECTION_DIRGA] #${correction.id} — ${type} appliqué — Employeur #${employeur_id}`);

    return res.status(201).json({
      success: true,
      message: 'Correction appliquée avec succès',
      data: {
        id: correction.id,
        reference: correction.reference,
        type: correction.type,
        libelle: correction.libelle,
        description: correction.description,
        employeur: { id: employeur.id, raison_sociale: employeur.raison_sociale, no_immatriculation: employeur.no_immatriculation },
        employe: employe ? { id: employe.id, last_name: employe.last_name, first_name: employe.first_name, matricule: employe.matricule } : null,
      },
    });
  } catch (err) {
    console.error('[CORRECTION_DIRGA] Erreur:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /bo/corrections ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 15);
    const offset = (page - 1) * limit;
    const { recherche, type } = req.query;

    const where = { reference: { [Op.like]: 'COR-%' } };
    if (type && CORRECTION_TYPES.includes(type)) where.type = type;
    if (recherche?.trim()) {
      where[Op.or] = [
        { reference: { [Op.like]: `%${recherche.trim()}%` } },
        { libelle: { [Op.like]: `%${recherche.trim()}%` } },
      ];
    }

    const { count, rows } = await ReclamationDemande.findAndCountAll({
      where,
      include: [{ model: Employeur, as: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    return res.status(200).json({
      success: true,
      data: rows.map((r) => ({
        id: String(r.id),
        reference: r.reference,
        type: r.type,
        libelle: r.libelle,
        description: r.description,
        date: r.createdAt ? (typeof r.createdAt === 'string' ? r.createdAt : r.createdAt.toISOString()).slice(0, 10) : null,
        employeur: r.employeur,
      })),
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /bo/corrections/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'ID invalide' });
    const r = await ReclamationDemande.findOne({
      where: { id, reference: { [Op.like]: 'COR-%' } },
      include: [{ model: Employeur, as: 'employeur', attributes: ['id', 'raison_sociale', 'no_immatriculation', 'email', 'phone_number'] }],
    });
    if (!r) return res.status(404).json({ success: false, message: 'Correction introuvable' });
    return res.status(200).json({ success: true, data: r });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
