/**
 * config.queue.js – File d'attente Bull pour validation employés / employeurs / affiliation volontaire
 * Utilise : utility (util_link, incrementLastSixDigits, generatedNotification), utility2 (mails), db/users/utility (hashPassword, generateUniqueCode), db/XYemployeurs/utility (Paylican)
 */
require('dotenv').config();
const Bull = require('bull');
const { Op } = require('sequelize');
const { client: redisClient } = require('./redis.connect');

const Employe = require('./db/employe/model');
const Prefecture = require('./db/prefecture/model');
const Employeur = require('./db/XYemployeurs/model');
const Users = require('./db/users/model');
const Document = require('./db/document/model');
const RequestEmployeur = require('./db/request_employeur/model');
const Branche = require('./db/branches/model');
const Activity = require('./db/domain_activite/model');
const Carer = require('./db/carriere/model');
const AffiliationVolontaire = require('./db/affiliation-volontaire/model');

const rootUtil = require('./utility');
const { util_link, incrementLastSixDigits, generatedNotification } = rootUtil;

const userUtil = require('./db/users/utility');
const { hashPassword, generateUniqueCode } = userUtil;

let sendValidateMailEmploye, sendMailEmployeurValidation, sendMailAfflitionVolonValidation;
try {
  const u2 = require('./utility2');
  sendValidateMailEmploye = u2.sendValidateMailEmploye || (() => Promise.resolve());
  sendMailEmployeurValidation = u2.sendMailEmployeurValidation || (() => Promise.resolve());
  sendMailAfflitionVolonValidation = u2.sendMailAfflitionVolonValidation || (() => Promise.resolve());
} catch (e) {
  sendValidateMailEmploye = () => Promise.resolve();
  sendMailEmployeurValidation = () => Promise.resolve();
  sendMailAfflitionVolonValidation = () => Promise.resolve();
}

let addEmployeOldDb, addEmployeurOldDB;
try {
  const oldDb = require('./old.db');
  addEmployeOldDb = oldDb.addEmployeOldDb || (() => Promise.resolve());
  addEmployeurOldDB = oldDb.addEmployeurOldDB || (() => Promise.resolve());
} catch (e) {
  addEmployeOldDb = () => Promise.resolve();
  addEmployeurOldDB = () => Promise.resolve();
}

let employeurUtil;
try {
  employeurUtil = require('./db/XYemployeurs/utility');
} catch (e) {
  employeurUtil = null;
}
const paylican_token = employeurUtil?.getPaylicanToken ? () => employeurUtil.getPaylicanToken() : () => Promise.resolve(null);
const paylican_create_company = employeurUtil?.paylican_create_company || (() => Promise.resolve());
const addingUserPaylican = employeurUtil?.addingUserPaylican || (() => Promise.resolve());

const queue = new Bull('requestQueue', {
  createClient: (type) => {
    if (type === 'bclient') return redisClient.duplicate();
    return redisClient;
  },
  limiter: { max: 1, duration: 10000 },
  settings: {
    lockDuration: 300000,
    lockRenewTime: 120000,
    stalledInterval: 120000,
    maxStalledCount: 3,
    guardInterval: 30000,
    retryProcessDelay: 30000,
    drainDelay: 5
  },
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  }
});

async function addJob(data) {
  const job = await queue.add(
    { data },
    { attempts: 3, backoff: 5000, removeOnComplete: true }
  );
  console.log(`📌 Job ${job.id} ajouté.`);
  return job.id;
}

/** Dernier employé immatriculé (pour incrément numéro). */
async function getLastImmatriculated() {
  const lastRecord = await Employe.findOne({
    order: [['immatriculation_date', 'DESC']],
    where: { is_imma: true, no_immatriculation: { [Op.ne]: null } }
  });
  return lastRecord || { no_immatriculation: '0000000000000' };
}

async function processEmployeOne(jobData, done) {
  try {
    const lastRecord = await getLastImmatriculated();
    const EmployeRecord = await Employe.findByPk(jobData.employeId, { include: [Prefecture, Employeur] });
    if (!EmployeRecord) {
      done(new Error('Employé introuvable'));
      return;
    }

    const immaIncremente = incrementLastSixDigits(lastRecord.no_immatriculation);
    const lastSixDigits = immaIncremente.substring(immaIncremente.length - 7);
    const employerYear = new Date(EmployeRecord.date_of_birth).getFullYear().toString();
    const employeMonth = (new Date(EmployeRecord.date_of_birth).getMonth() + 1).toString().padStart(2, '0');

    EmployeRecord.no_immatriculation = `${EmployeRecord.gender === 'M' ? 1 : 2}${employerYear[2]}${employerYear[3]}${employeMonth}${EmployeRecord.prefecture?.code ?? ''}${lastSixDigits}`;
    EmployeRecord.who_valid = jobData.who_valid;
    EmployeRecord.is_imma = true;
    EmployeRecord.immatriculation_date = new Date().toISOString();
    EmployeRecord.date_first_embauche = EmployeRecord.worked_date;
    await EmployeRecord.save();

    await Carer.create({
      employeId: EmployeRecord.id,
      employeurId: EmployeRecord.employeur?.id,
      date_entre: EmployeRecord.worked_date
    });

    const user_password = generateUniqueCode(9);
    const user_password_hashed = await hashPassword(user_password);
    await Users.create({
      user_identify: EmployeRecord.no_immatriculation,
      role: 'employe',
      password: user_password_hashed,
      first_login: true,
      user_id: EmployeRecord.id,
      full_name: `${EmployeRecord.first_name ?? ''} ${EmployeRecord.last_name ?? ''}`,
      email: EmployeRecord.email ?? '',
      phone_number: EmployeRecord.phone_number ?? '',
      identity: EmployeRecord.no_immatriculation
    });

    let EmployeurRecord = await Employeur.findByPk(EmployeRecord.employeur?.id);
    if (EmployeurRecord && EmployeurRecord.number_employe > 20) {
      EmployeurRecord.category = 'E+20';
      if (EmployeRecord.gender === 'M') EmployeurRecord.effectif_homme = (EmployeurRecord.effectif_homme || 0) + 1;
      else EmployeurRecord.effectif_femme = (EmployeurRecord.effectif_femme || 0) + 1;
      await EmployeurRecord.save();
    }
    if (!EmployeurRecord) EmployeurRecord = EmployeRecord.employeur;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (EmployeRecord.email && emailRegex.test(EmployeRecord.email)) {
      await sendValidateMailEmploye(EmployeRecord.email, EmployeRecord, EmployeurRecord, user_password);
    }
    await addEmployeOldDb(EmployeRecord);
    done();
  } catch (error) {
    console.error('[queue] employé_one:', error);
    done(new Error('Job failed'));
  }
}

async function processEmployeur(jobData, done) {
  try {
    const EmployeurRecord = await Employeur.findByPk(parseInt(jobData.employeurId, 10), {
      include: [RequestEmployeur, { model: Branche, as: 'branche', include: [Activity] }, Prefecture]
    });
    if (!EmployeurRecord) {
      done(new Error('Employeur introuvable'));
      return;
    }

    const lastEmployeur = await Employeur.findOne({
      order: [['date_immatriculation', 'DESC']],
      where: { is_immatriculed: true, is_new_compamy: true, no_immatriculation: { [Op.ne]: null } }
    });
    const anciencode = lastEmployeur?.no_immatriculation?.slice(4, 9) || '0';
    let increAncienCode = parseInt(anciencode, 10) + 1;
    const no_immatriculation = `${EmployeurRecord.branche?.code ?? ''}${EmployeurRecord.prefecture?.code ?? ''}${increAncienCode}${EmployeurRecord.prefecture?.code ?? ''}00`;

    const user_password = generateUniqueCode(9);
    const user_password_hashed = await hashPassword(user_password);

    const token = await paylican_token();
    if (!token) {
      console.warn('[queue] Paylican token non disponible, poursuite sans Paylican');
    }
    await paylican_create_company(EmployeurRecord, token, no_immatriculation);

    EmployeurRecord.no_immatriculation = no_immatriculation;
    EmployeurRecord.is_immatriculed = true;
    EmployeurRecord.date_immatriculation = new Date().toISOString();
    EmployeurRecord.who_valide = parseInt(jobData.user_valid, 10);
    if (EmployeurRecord.number_employe >= 20) EmployeurRecord.category = 'E+20';
    await EmployeurRecord.save();

    const OneUser = await Users.create({
      user_identify: no_immatriculation,
      role: 'employeur',
      password: user_password_hashed,
      first_login: true,
      user_id: EmployeurRecord.id,
      identity: no_immatriculation,
      full_name: `${EmployeurRecord.request_employeur?.first_name ?? ''} ${EmployeurRecord.request_employeur?.last_name ?? ''}`,
      email: EmployeurRecord.email ?? '',
      phone_number: EmployeurRecord.phone_number ?? ''
    });
    OneUser.first_name = EmployeurRecord.request_employeur?.first_name;
    OneUser.last_name = EmployeurRecord.request_employeur?.last_name;
    await addingUserPaylican(OneUser, EmployeurRecord);

    const code = generateUniqueCode(9);
    const notifName = `immatriculation-${EmployeurRecord.id}-${code}`;
    const filePath = await generatedNotification(notifName, EmployeurRecord, code);
    await Document.create({
      name: "Notification d'immatriculation",
      path: `/api/v1/docsx/${notifName}.pdf`,
      employeurId: EmployeurRecord.id,
      code
    });
    await sendMailEmployeurValidation(EmployeurRecord.email, EmployeurRecord, user_password, filePath);
    await addEmployeurOldDB(EmployeurRecord, increAncienCode);
    done();
  } catch (error) {
    console.error('[queue] employeur:', error);
    done(new Error('Job failed'));
  }
}

async function processEmployeBulk(jobData, done) {
  try {
    let lastRecord = await getLastImmatriculated();
    let immaIncremente = incrementLastSixDigits(lastRecord.no_immatriculation);

    for (const element of jobData.allEmploye || []) {
      element.email = null;
      element.phone_number = null;
      const lastSixDigits = immaIncremente.substring(immaIncremente.length - 7);
      const employerYear = new Date(element.date_of_birth).getFullYear().toString();
      const employeMonth = (new Date(element.date_of_birth).getMonth() + 1).toString().padStart(2, '0');
      const getPref = await Prefecture.findByPk(element.prefectureId);
      element.no_immatriculation = `${element.gender === 'M' ? 1 : 2}${employerYear[2]}${employerYear[3]}${employeMonth}${getPref?.code ?? ''}${lastSixDigits}`;
      element.is_imma = true;
      element.is_adhesion = false;
      element.immatriculation_date = new Date().toISOString();

      const created = await Employe.create(element);
      const EmployeToAdd = await Employe.findByPk(created.id, { include: [Employeur, Prefecture] });
      await addEmployeOldDb(EmployeToAdd);

      await Carer.create({
        employeId: created.id,
        employeurId: element.employeurId,
        date_entre: element.worked_date
      });

      const EmployeurRecord = await Employeur.findByPk(element.employeurId);
      if (EmployeurRecord && EmployeurRecord.number_employe > 20) {
        EmployeurRecord.category = 'E+20';
        if (element.gender === 'M') EmployeurRecord.effectif_homme = (EmployeurRecord.effectif_homme || 0) + 1;
        else EmployeurRecord.effectif_femme = (EmployeurRecord.effectif_femme || 0) + 1;
        await EmployeurRecord.save();
      }
      immaIncremente = incrementLastSixDigits(immaIncremente);
    }
    done();
  } catch (error) {
    console.error('[queue] employeBulk:', error);
    done(error);
  }
}

async function processExistEmploye(data, done) {
  try {
    for (const element of data || []) {
      const existing = await Employe.findOne({ where: { no_immatriculation: element.no_immatriculation } });
      if (existing) continue;

      const res = await fetch(`${util_link}/anciencode/veriy_employe/${element.no_immatriculation}/${element.employeur?.no_immatriculation}`);
      if (res.status === 200) {
        const responseOld = await res.json();
        const created = await Employe.create({
          employeurId: element.employeurId,
          is_imma: true,
          is_adhesion: true,
          is_insert_oldDB: true,
          immatriculation_date: responseOld.date_immatriculation,
          date_of_birth: responseOld.date_naissance,
          gender: responseOld.sexe,
          place_of_birth: responseOld.lieu_naissance,
          mother_last_name: responseOld.nom_mere,
          father_last_name: responseOld.nom_pere,
          mother_first_name: responseOld.prenom_mere,
          father_first_name: responseOld.prenom_pere,
          worked_date: responseOld.date_embauche,
          nationality: responseOld.nationalite,
          first_name: responseOld.prenoms,
          last_name: responseOld.nom,
          no_immatriculation: element.no_immatriculation,
          salary: element.salary,
          type_contrat: element.type_contrat,
          who_valid: element.who_valid
        });
        await Carer.create({
          employeurId: element.employeurId,
          employeId: created.id,
          date_entre: responseOld.date_embauche
        });
      } else {
        await Employe.create({
          employeurId: element.employeurId,
          is_adhesion: true,
          is_insert_oldDB: true,
          first_name: element.first_name,
          last_name: element.last_name,
          no_immatriculation: element.no_immatriculation,
          salary: element.salary,
          type_contrat: element.type_contrat,
          who_valid: element.who_valid
        });
      }
    }
    done();
  } catch (error) {
    console.error('[queue] exist_employe:', error);
    done(new Error('Job failed'));
  }
}

async function handleNotifySms(EmployeList, EmployeurRecord, periode, done) {
  try {
    for (const el of EmployeList || []) {
      const msg = `Bonjour M/Mme ${el?.first_name ?? ''} ${el?.last_name ?? ''}. Nous vous informons que votre employeur ${EmployeurRecord?.raison_sociale ?? ''} vient de cotiser pour vous au titre ${periode ?? ''}.`;
      const response = await fetch('https://api.smspromtngn.com/v1/messages/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.smskey}`
        },
        body: JSON.stringify({
          sender: 'CNSS GUINEE',
          message: msg,
          contact: `+224${el?.phone_number ?? ''}`
        })
      });
      if (response.ok) console.log('SMS envoyé');
      else console.warn('SMS non envoyé');
    }
    done();
  } catch (error) {
    console.error('[queue] send_sms:', error);
    done();
  }
}

async function processAffiliationVolontaire(jobData, done) {
  try {
    const aV = await AffiliationVolontaire.findByPk(jobData.affiliation_volontaireId, {
      include: [{ model: Branche, as: 'branche' }, { model: Prefecture, as: 'prefecture' }]
    });
    if (!aV) {
      done(new Error('Affiliation volontaire introuvable'));
      return;
    }

    const lastRecord = await getLastImmatriculated();
    let immaIncremente = incrementLastSixDigits(lastRecord.no_immatriculation);
    const lastSixDigits = immaIncremente.substring(immaIncremente.length - 7);
    const applicantYear = new Date(aV.date_naissance).getFullYear().toString();
    const applicantMonth = (new Date(aV.date_naissance).getMonth() + 1).toString().padStart(2, '0');
    aV.no_immatriculation = `${aV.gender === 'M' ? 1 : 2}${applicantYear[2]}${applicantYear[3]}${applicantMonth}${aV.prefecture?.code ?? ''}${lastSixDigits}`;
    aV.status = 'Valide';

    const user_password = generateUniqueCode(9);
    const user_password_hashed = await hashPassword(user_password);
    await Users.create({
      user_identify: aV.no_immatriculation,
      role: 'AV',
      password: user_password_hashed,
      first_login: true,
      user_id: aV.id,
      full_name: `${aV.prenom ?? ''} ${aV.nom ?? ''}`,
      email: aV.email ?? '',
      phone_number: aV.phone_number ?? '',
      identity: aV.no_immatriculation
    });

    await sendMailAfflitionVolonValidation(aV.email, aV, user_password);
    await aV.save();
    done();
  } catch (error) {
    console.error('[queue] affiliation_volontaire:', error);
    done(new Error('Job failed'));
  }
}

function startJob() {
  queue.process(async (job, done) => {
    const jobData = job.data?.data || {};
    console.log(`[queue] starting job ${job.id} type=${jobData.type}`);

    try {
      if (jobData.type === 'employé_one') {
        await processEmployeOne(jobData, done);
      } else if (jobData.type === 'employeur') {
        await processEmployeur(jobData, done);
      } else if (jobData.type === 'employeBulk') {
        await processEmployeBulk(jobData, done);
      } else if (jobData.type === 'exist_employe') {
        await processExistEmploye(jobData.data, done);
      } else if (jobData.type === 'send_sms') {
        await handleNotifySms(jobData.Employe, jobData.Employeur, jobData.periode, done);
      } else if (jobData.type === 'affiliation_volontaire') {
        await processAffiliationVolontaire(jobData, done);
      } else {
        done(new Error(`Type de job inconnu: ${jobData.type}`));
      }
    } catch (err) {
      console.error('[queue] process error:', err);
      done(err);
    }
  });
}

queue.on('completed', (job) => {
  console.log(`🗑️ Job ${job.id} terminé.`);
});

module.exports = {
  addJob,
  startJob,
  queue
};
