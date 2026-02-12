/**
 * Routes adhésion – version améliorée
 * Création, liste paginée, validation (Paylican, employeur, user, mail, pénalités), getData_old, excel, update.
 *
 * Dépendances optionnelles à la racine :
 * - ../../utility : util_link
 * - ../../utility2 : sendMailAdhesion
 * - ../../old.db : getPenality
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { EmployeurToken, generateUniqueCode, hashPassword } = require('../users/utility');
const { verifyToken } = require('../XYemployeurs/utility');
const employeurUtil = require('../XYemployeurs/utility');
const Adhesion = require('./model');
const RequestEmployeur = require('../request_employeur/model');
const Employeur = require('../XYemployeurs/model');
const Users = require('../users/model');
const utility = require('./utility');

const { hasExistingAdhesion, buildRequesterFromAdhesion, buildEmployeurFromAdhesion, buildUserFromAdhesion } = utility;

// Pagination
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function getPaginationParams(source = {}) {
  const page = Math.max(1, parseInt(source.page, 10) || DEFAULT_PAGE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(source.pageSize, 10) || DEFAULT_PAGE_SIZE));
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

function formatPaginatedResponse(data, totalItems, page, pageSize) {
  return {
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
    currentPage: page,
    pageSize,
    data
  };
}

// Modules optionnels
let util_link, sendMailAdhesion, getPenality, paylican_create_company;
try {
  const rootUtil = require('../../utility');
  util_link = rootUtil.util_link || '';
} catch {
  util_link = '';
}
try {
  const u2 = require('../../utility2');
  sendMailAdhesion = u2.sendMailAdhesion || (() => {});
} catch {
  sendMailAdhesion = () => {};
}
try {
  const oldDb = require('../../old.db');
  getPenality = oldDb.getPenality || (() => {});
} catch {
  getPenality = () => {};
}
try {
  paylican_create_company = employeurUtil.paylican_create_company;
} catch {
  paylican_create_company = null;
}

const router = express.Router();

// ---------- Création adhésion ----------
router.post('/create_adhesion', async (req, res) => {
  try {
    const data = req.body.data || req.body;
    const no_immatriculation = data.no_immatriculation;
    if (!no_immatriculation) {
      return res.status(400).json({ message: 'no_immatriculation requis' });
    }
    if (await hasExistingAdhesion(no_immatriculation)) {
      return res.status(400).json({ message: 'Cet employeur a déjà adhéré' });
    }
    await Adhesion.create(data);
    return res.status(200).json({ message: 'Adhésion effectuée avec succès' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Erreur, veuillez réessayer' });
  }
});

// ---------- Liste paginée (admin / DIRGA) ----------
router.get('/all_adhesion', verifyToken, async (req, res) => {
  try {
    const { page, pageSize, offset, limit } = getPaginationParams(req.query);
    const { count, rows } = await Adhesion.findAndCountAll({
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });
    return res.status(200).json(formatPaginatedResponse(rows, count, page, pageSize));
  } catch (error) {
    res.status(400).json({ message: 'Erreur' });
  }
});

// ---------- Validation adhésion (création employeur + user + Paylican + mail) ----------
router.post('/validate_adhesion/:id', verifyToken, async (req, res) => {
  try {
    const getAdhesion = await Adhesion.findByPk(req.params.id);
    if (!getAdhesion) {
      return res.status(404).json({ message: 'Adhésion introuvable' });
    }
    if (getAdhesion.is_valid) {
      return res.status(400).json({ message: 'Cette adhésion a déjà été validée' });
    }

    let token = null;
    if (employeurUtil.getPaylicanToken) {
      token = await employeurUtil.getPaylicanToken();
    }
    if (paylican_create_company && token) {
      await paylican_create_company(getAdhesion, token, getAdhesion.no_immatriculation);
    }

    const requester = await RequestEmployeur.create(buildRequesterFromAdhesion(getAdhesion));
    const employeurData = buildEmployeurFromAdhesion(getAdhesion, requester.id);
    const EmployeurRecord = await Employeur.create(employeurData);

    const nohased_password = generateUniqueCode(9);
    const user_password_hashed = await hashPassword(nohased_password);
    const userPayload = buildUserFromAdhesion(getAdhesion, EmployeurRecord.id, user_password_hashed);
    const OneUser = await Users.create(userPayload);

    OneUser.first_name = getAdhesion.first_name;
    OneUser.last_name = getAdhesion.last_name;
    if (employeurUtil.addingUserPaylican) {
      await employeurUtil.addingUserPaylican(OneUser, EmployeurRecord);
    }

    getAdhesion.active_btn = true;
    getAdhesion.is_valid = true;
    getAdhesion.valid_date = new Date();
    getAdhesion.who_valid = req.user.id;
    await getAdhesion.save();

    sendMailAdhesion(getAdhesion, nohased_password);
    getPenality(EmployeurRecord.id, EmployeurRecord.no_immatriculation);

    return res.status(200).json({ message: 'Adhésion effectuée avec succès' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
});

// ---------- Données ancienne base ----------
router.get('/getData_old/:id', async (req, res) => {
  try {
    if (!util_link) {
      return res.status(503).json({ message: 'Service ancienne base non configuré' });
    }
    const response = await fetch(`${util_link}/anciencode/verify/${req.params.id}`, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.ok) {
      const data = await response.json();
      return res.status(200).json(data);
    }
    return res.status(400).json({ message: 'Erreur, réessayer' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Erreur, réessayer' });
  }
});

// ---------- Export Excel (employeur connecté) ----------
router.get('/excel_file', EmployeurToken, async (req, res) => {
  try {
    const user_identify = req.user?.user_identify ?? req.user?.identity;
    if (!user_identify) {
      return res.status(400).json({ message: 'Identité utilisateur manquante' });
    }
    if (!util_link) {
      return res.status(503).json({ message: 'Service ancienne base non configuré' });
    }
    const response = await fetch(`${util_link}/anciencode/employe/${user_identify}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const docsDir = path.join(__dirname, '../../document/docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
    const filePath = path.join(docsDir, `employe_${user_identify}.xlsx`);
    fs.writeFileSync(filePath, buffer);
    return res.status(200).json({ path: `employe_${user_identify}.xlsx` });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Erreur, veuillez réessayer' });
  }
});

// ---------- Mise à jour adhésion (admin) ----------
router.post('/update_adhesion/:id', verifyToken, async (req, res) => {
  try {
    const getAdhesion = await Adhesion.findByPk(req.params.id);
    if (!getAdhesion) {
      return res.status(404).json({ message: 'Adhésion introuvable' });
    }
    const body = req.body;
    if (body.email != null) getAdhesion.email = body.email;
    if (body.phone_number != null) getAdhesion.phone_number = body.phone_number;
    if (body.adresse != null) getAdhesion.address = body.adresse;
    if (body.category != null) getAdhesion.category = body.category;
    if (body.first_name != null) getAdhesion.first_name = body.first_name;
    if (body.last_name != null) getAdhesion.last_name = body.last_name;
    getAdhesion.active_btn = true;
    await getAdhesion.save();
    return res.status(200).json({ message: 'Mise à jour effectuée' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Erreur' });
  }
});

const route_adhesion = router;
module.exports = {
  route_adhesion
};
