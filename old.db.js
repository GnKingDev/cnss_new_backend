/**
 * old.db.js – Synchronisation avec l'ancienne base (API externe)
 * Utilisé par : config.queue, db/employe, db/paiement, db/adhesion, db/cotisation_employeur
 */
require('dotenv').config();

const employeur = require('./db/XYemployeurs/model');
const employe = require('./db/employe/model');
const cotisation_employeur = require('./db/cotisation_employeur/model');
const Penalite = require('./db/penalites/model');

const util_link = process.env.OLD_DB_API_URL || 'http://192.168.56.128';

const idPrefecture = [
  { id: 1, code: '02' }, { id: 2, code: '02' }, { id: 3, code: '03' }, { id: 4, code: '04' },
  { id: 5, code: '05' }, { id: 6, code: '06' }, { id: 7, code: '07' }, { id: 8, code: '08' },
  { id: 9, code: '09' }, { id: 10, code: '10' }, { id: 11, code: '11' }, { id: 12, code: '12' },
  { id: 13, code: '13' }, { id: 14, code: '14' }, { id: 15, code: '15' }, { id: 16, code: '16' },
  { id: 17, code: '17' }, { id: 18, code: '18' }, { id: 19, code: '20' }, { id: 20, code: '21' },
  { id: 21, code: '22' }, { id: 22, code: '23' }, { id: 23, code: '24' }, { id: 24, code: '25' },
  { id: 25, code: '26' }, { id: 26, code: '27' }, { id: 27, code: '28' }, { id: 29, code: '30' },
  { id: 30, code: '31' }, { id: 31, code: '32' }, { id: 32, code: '33' }, { id: 33, code: '34' },
  { id: 34, code: '39' }, { id: 35, code: '40' }, { id: 36, code: '99' }, { id: 37, code: '19' },
  { id: 39, code: '41' }, { id: 40, code: '100' }, { id: 43, code: '37' }, { id: 44, code: '38' }
];

const mounth = [
  { name: 'JANVIER', id: 1, code: '01' }, { name: 'FEVRIER', id: 2, code: '02' },
  { name: 'MARS', id: 3, code: '03' }, { name: 'AVRIL', id: 4, code: '04' },
  { name: 'MAI', id: 5, code: '05' }, { name: 'JUIN', id: 6, code: '06' },
  { name: 'JUILLET', id: 7, code: '07' }, { name: 'AOUT', id: 8, code: '08' },
  { name: 'SEPTEMBRE', id: 9, code: '09' }, { name: 'OCTOBRE', id: 10, code: '10' },
  { name: 'NOVEMBRE', id: 11, code: '11' }, { name: 'DECEMBRE', id: 12, code: '12' },
  { name: '13e MOIS', id: 11, code: '12' }, { name: '14e MOIS', id: 11, code: '12' },
  { name: '15e MOIS', id: 11, code: '12' }
];

const bulkAdd = [
  { name: 'CAISSE', collector_code: 'CNSSCAISSE', old_db_id: 0 },
  { name: 'UBA Guinée', collector_code: 'GNUBA', old_db_id: 23 }
];

function calculerDates(dateEntree) {
  const date = new Date(dateEntree);
  if (isNaN(date.getTime())) {
    throw new Error("La date entrée n'est pas valide.");
  }
  const dateEcheance = date.toISOString().split('T')[0];
  const dateFinEchange = new Date(date.getFullYear(), date.getMonth() + 1, 20);
  return {
    dateEcheance,
    dateFinEchange: dateFinEchange.toISOString()
  };
}

async function addEmployeurOldDB(data, anciencode) {
  try {
    const Emp = data.employeur || data.Employeur;
    const Req = data.request_employeur;
    const Pref = data.prefecture;
    const Branche = data.branche || data.branches;

    const insertData = {
      categorie: data.category,
      code_activp: Branche?.code,
      commune: Pref?.name || '',
      date_creation: data.date_creation,
      date_created: data.createdAt,
      date_imm: data.date_immatriculation,
      description: '',
      email: data.email,
      no_agrement: data.no_rccm,
      no_dni: data.no_dni,
      no_employeur: data.no_immatriculation,
      quartier: data.adresse || '',
      raison_sociale: data.raison_sociale,
      adresse: data.adresse || '',
      ville: Pref?.name || '',
      contact_demandeur: Req?.phone_number || '',
      effectif_apprentis: data.effectif_apprentis,
      effectif_femmes: data.effectif_femme,
      effectif_hommes: data.effectif_homme,
      nom_demandeur: Req?.last_name || '',
      prenom_demandeur: Req?.first_name || '',
      anciencode: anciencode,
      effectif_total: data.effectif_total,
      pref_id: idPrefecture.find((e) => e.code === Pref?.code)?.id,
      code_prefecture: Pref?.code || ''
    };

    const response = await fetch(`${util_link}/declare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(insertData)
    });

    if (response.ok) {
      const EmployeurRecord = await employeur.findByPk(data.id);
      if (EmployeurRecord) {
        EmployeurRecord.is_insert_oldDB = true;
        await EmployeurRecord.save();
      }
      return;
    }
    const errorMsg = await response.text();
    console.error('[old.db] addEmployeurOldDB:', response.status, errorMsg);
  } catch (err) {
    console.error('[old.db] addEmployeurOldDB:', err);
  }
}

async function addEmployeOldDb(data) {
  const Emp = data.employeur || data.Employeur;
  const Pref = data.prefecture;
  if (!Emp || !Pref) {
    console.warn('[old.db] addEmployeOldDb: employeur ou prefecture manquant');
    return;
  }

  const insertData = {
    date_created: data.createdAt,
    date_embauche: data.worked_date,
    date_immatriculation: data.immatriculation_date,
    date_naissance: new Date(data.date_of_birth).toISOString(),
    lieu_naissance: data.place_of_birth,
    nationalite: data.nationality,
    no_employe: data.no_immatriculation,
    no_employeur: Emp.no_immatriculation,
    nom: data.last_name,
    nom_mere: data.mother_last_name,
    nom_pere: data.father_last_name,
    prefecture: Pref.name,
    prenom_mere: data.mother_first_name,
    prenom_pere: data.father_first_name,
    prenoms: data.first_name,
    profession: data.fonction,
    sexe: data.gender,
    adresse: data.adress,
    matricule: data.matricule
  };

  try {
    const response = await fetch(`${util_link}/employe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(insertData)
    });
    if (response.ok) {
      const EmployeRecord = await employe.findByPk(data.id);
      if (EmployeRecord) {
        EmployeRecord.is_insert_oldDB = true;
        await EmployeRecord.save();
      }
    }
  } catch (err) {
    console.error('[old.db] addEmployeOldDb:', err);
  }
}

async function addDeclartionDebit(data, periode) {
  const monthInfo = mounth.find((e) => e.name === data.periode);
  if (!monthInfo) {
    console.warn('[old.db] addDeclartionDebit: période non trouvée', data.periode);
    return;
  }
  const getMonthCode = monthInfo.code;
  const debut_echeance_principal = new Date(`${data.year}-${getMonthCode}-01`).toISOString();
  const Emp = data.employeur || data.Employeur;
  if (!Emp) return;
  const ancien_code = Emp.no_immatriculation.slice(4, 9);

  const insertData = {
    annee: data.year,
    date_created: data.createdAt,
    mnt_principal: data.total_branche,
    no_employeur: Emp.no_immatriculation,
    periode,
    label: 'FACTURATION SUR PRINCIPAL',
    mnt_majoration: 0,
    mnt_majoration_paye: 0,
    mnt_ssc: data.total_salary_soumis_cotisation,
    mois_debut: monthInfo.id,
    mois_fin: monthInfo.id,
    nb_employes: data.current_effectif,
    nb_new_embauches: data.effectif_embauche,
    mnt_principal_initial: data.total_branche,
    mnt_stp: data.total_salary_soumis_cotisation,
    nb_old_quit: data.effectif_leave,
    date_retour_appel: data.createdAt,
    debut_echeance_principal,
    fin_echeance_principal: calculerDates(debut_echeance_principal).dateFinEchange,
    ancien_code
  };

  try {
    const response = await fetch(`${util_link}/compte_employeur_debit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(insertData)
    });
    if (response.ok) {
      const Demployeur = await cotisation_employeur.findByPk(data.id);
      if (Demployeur) {
        Demployeur.is_insert_oldDB_debit = true;
        await Demployeur.save();
      }
    }
  } catch (err) {
    console.error('[old.db] addDeclartionDebit:', err);
  }
}

async function addDeclarationCredit(data, noquittance, periode, paiement) {
  const bankItem = bulkAdd.find((e) => e.collector_code === paiement.bank_name);
  const getBankId = bankItem?.old_db_id;
  const bankName = bankItem?.name || paiement.bank_name;
  const Emp = data.employeur || data.Employeur;
  if (!Emp) return;
  const ancien_code = Emp.no_immatriculation.slice(4, 9);

  const insertData = {
    annee: data.year,
    date_created: data.paid_date,
    mnt_principal: data.total_branche,
    montant: data.total_branche,
    no_employeur: Emp.no_immatriculation,
    periode,
    label: 'PAIEMENT DU PRINCIPAL',
    noquittance,
    date_jour_retour: data.paid_date,
    banque_id: getBankId,
    reference: `VIREMENT ${Emp.raison_sociale} ${data.periode}-${data.year}`,
    date_paiement: data.paid_date,
    bank_name: bankName,
    raison_sociale: Emp.raison_sociale,
    ancien_code,
    date_retour_appel: data.paid_date
  };

  try {
    const response = await fetch(`${util_link}/compte_employeur_credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(insertData)
    });
    if (response.ok) {
      const Demployeur = await cotisation_employeur.findByPk(data.id);
      if (Demployeur) {
        Demployeur.is_insert_oldDB_credit = true;
        await Demployeur.save();
      }
    }
  } catch (err) {
    console.error('[old.db] addDeclarationCredit:', err);
  }
}

async function getFamillyConjoint(id) {
  const response = await fetch(`${util_link}/other/get_conjoint/${id}`);
  if (response.ok) return response.json();
  throw new Error('getFamillyConjoint failed');
}

async function getFamillyEnfant(id) {
  const response = await fetch(`${util_link}/other/get_children/${id}`);
  if (response.ok) return response.json();
  throw new Error('getFamillyEnfant failed');
}

async function getEmployeur(id) {
  const response = await fetch(`${util_link}/anciencode/verify/${id}`);
  if (response.ok) return response.json();
  throw new Error('getEmployeur failed');
}

async function getCarer(id) {
  const response = await fetch(`${util_link}/other/get_carrer/${id}`);
  if (response.ok) return response.json();
  throw new Error('getCarer failed');
}

async function getOldCotisation(id) {
  const response = await fetch(`${util_link}/other/get_employe_old_cotisation/${id}`);
  if (response.ok) return response.json();
  return null;
}

async function getPenality(id, no_employeur) {
  try {
    const response = await fetch(`${util_link}/anciencode/archives/${id}/${no_employeur}`);
    if (!response.ok) return;
    const data = await response.json();
    const to_save = data.map((element) => ({
      periode: element.periode,
      motif: element.libelle_ecriture,
      montant: element.montant,
      no_quittance: element.noquittance,
      encaissement_id: element.encaissement_id,
      facturation_id: element.facturation_id,
      data_penalite: element.date_ecriture,
      employeurId: id
    }));
    await Penalite.bulkCreate(to_save);
  } catch (err) {
    console.error('[old.db] getPenality:', err);
  }
}

async function closePenality(no_employeur, data) {
  try {
    const response = await fetch(`${util_link}/anciencode/payPenalite/${no_employeur}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (response.ok && data?.id) {
      const penalite = await Penalite.findByPk(data.id);
      if (penalite) {
        penalite.is_insert_old_db = true;
        await penalite.save();
      }
    }
  } catch (err) {
    console.error('[old.db] closePenality:', err);
  }
}

module.exports = {
  addEmployeurOldDB,
  addEmployeOldDb,
  addDeclarationCredit,
  addDeclartionDebit,
  getPenality,
  closePenality,
  calculerDates,
  getFamillyEnfant,
  getFamillyConjoint,
  getCarer,
  getEmployeur,
  getOldCotisation
};
