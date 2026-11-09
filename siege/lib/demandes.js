// Demandes des collaborateurs au directeur (arrivées par Telegram) : DEM-001, DEM-002…
// Fichier privé ~/.siege/demandes.json (noms et messages de personnes : jamais dans le dépôt), écrit sous verrou.
// Cycle : Nouvelle → En cours ↔ À valider (le demandeur confirme le résumé) → Chez le CEO (si le directeur le juge utile)
//         → Acceptée (ticket créé) | Refusée | Close.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const PRIVE = () => process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege');
const F = () => path.join(PRIVE(), 'demandes.json');
const STATUTS = ['Nouvelle', 'En cours', 'À valider', 'Chez le CEO', 'Acceptée', 'Refusée', 'Close'];
const FINIS = ['Acceptée', 'Refusée', 'Close'];
const ID = /^DEM-\d{3,5}$/, TICKET = /^([A-Z]{3}-\d{3}|BUG-\d{3})$/;
const MAX_TEXTE = 2000;

class ErreurDemande extends Error {}
const refus = m => { throw new ErreurDemande(m); };
const texte = (s, max = MAX_TEXTE) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

function lire() { try { const d = JSON.parse(fs.readFileSync(F(), 'utf8')); return { liste: Array.isArray(d.liste) ? d.liste : [] }; } catch { return { liste: [] }; } }
// Verrou par création exclusive d'un fichier (plusieurs processus : serveur, sessions du directeur)
function sousVerrou(fn) {
  fs.mkdirSync(PRIVE(), { recursive: true, mode: 0o700 });
  const v = F() + '.lock', debut = Date.now();
  for (;;) {
    try { fs.writeFileSync(v, String(process.pid), { flag: 'wx' }); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(v).mtimeMs > 10e3) fs.unlinkSync(v); } catch {}
      if (Date.now() - debut > 5e3) refus('Demandes verrouillées, réessayez');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    const d = lire(), r = fn(d);
    const t = F() + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(d, null, 1), { mode: 0o600 }); fs.renameSync(t, F());
    return r;
  } finally { try { fs.unlinkSync(v); } catch {} }
}

const trouver = (d, id) => (ID.test(id || '') && d.liste.find(x => x.id === id)) || refus('Demande introuvable : ' + id);
const ouverte = x => !FINIS.includes(x.statut);
const maintenant = () => new Date().toISOString();

// Message d'un collaborateur : ajouté à sa demande ouverte, sinon nouvelle demande (ou nouvelle si `nouvelle`)
function recevoir(auteur, t, { nouvelle = false } = {}) {
  t = texte(t); if (!t) refus('Message vide');
  return sousVerrou(d => {
    let x = !nouvelle && [...d.liste].reverse().find(y => y.auteur.id === auteur.id && ouverte(y));
    if (!x) {
      const n = d.liste.reduce((m, y) => Math.max(m, Number(y.id.slice(4))), 0) + 1;
      x = { id: 'DEM-' + String(n).padStart(3, '0'), auteur: { id: auteur.id, nom: texte(auteur.nom, 80) }, statut: 'Nouvelle', type: '', resume: '',
        ticket: '', validee: false, ceo: '', creee: maintenant(), maj: '', messages: [] };
      d.liste.push(x);
    }
    x.messages.push({ de: 'collaborateur', texte: t, date: maintenant() });
    if (x.statut === 'À valider') x.validee = false;   // le demandeur a écrit au lieu de valider : on reprend
    if (x.statut !== 'Chez le CEO') x.statut = x.statut === 'Nouvelle' ? 'Nouvelle' : 'En cours';
    x.maj = maintenant(); return x;
  });
}
// Réponse du demandeur au résumé (boutons) ; décision ou message du CEO
function validation(id, auteurId, ok) {
  return sousVerrou(d => {
    const x = trouver(d, id);
    if (x.auteur.id !== auteurId) refus('Seul le demandeur valide sa demande');
    if (x.statut !== 'À valider') refus('Rien à valider sur ' + id);
    x.validee = !!ok; x.statut = 'En cours';
    x.messages.push({ de: 'collaborateur', texte: ok ? '✔ Résumé validé' : '✘ Résumé à corriger', date: maintenant() }); x.maj = maintenant(); return x;
  });
}
function ceo(id, { decision, texte: t }) {
  return sousVerrou(d => {
    const x = trouver(d, id);
    if (decision) { if (!['accepte', 'refuse'].includes(decision)) refus('Décision inconnue'); x.ceo = decision; }
    x.messages.push({ de: 'CEO', texte: decision ? (decision === 'accepte' ? '✔ Accepté par le CEO' : '✘ Refusé par le CEO') + (t ? ' — ' + texte(t) : '') : texte(t), date: maintenant() });
    if (ouverte(x)) x.statut = 'En cours';
    x.maj = maintenant(); return x;
  });
}

// Actions du directeur (via node siege/demande.js) : chacune trace son message dans la demande
function directeur(id, action, { texte: t = '', resume = '', type = '', ticket = '' } = {}) {
  return sousVerrou(d => {
    const x = trouver(d, id);
    if (!ouverte(x)) refus(`${id} est ${x.statut.toLowerCase()}`);
    const dire = s => x.messages.push({ de: 'directeur', texte: texte(s), date: maintenant() });
    switch (action) {
      case 'repondre': if (!texte(t)) refus('--texte vide'); dire(t); x.statut = 'En cours'; break;
      case 'valider':
        if (!texte(resume)) refus('--resume vide');
        if (type && !['feature', 'bug', 'question'].includes(type)) refus('--type feature, bug ou question');
        x.resume = texte(resume); if (type) x.type = type; x.validee = false; x.statut = 'À valider'; dire('Résumé à valider : ' + x.resume); break;
      case 'escalader':
        if (!texte(t)) refus('--texte vide (ce que le CEO doit trancher)');
        x.ceo = ''; x.statut = 'Chez le CEO'; dire('Transmis au CEO : ' + texte(t)); break;
      case 'ticket':
        if (!TICKET.test(ticket)) refus('--ticket <ID du ticket créé>');
        if (!x.validee) refus('Le demandeur n\'a pas validé le résumé : node siege/demande.js valider d\'abord');
        if (x.statut === 'Chez le CEO' || x.ceo === 'refuse') refus('Le CEO doit d\'abord accepter (ou a refusé)');
        x.ticket = ticket; x.statut = 'Acceptée'; dire('Ticket créé : ' + ticket + (t ? ' — ' + texte(t) : '')); break;
      case 'refuser': if (!texte(t)) refus('--texte : la raison, pour le demandeur'); x.statut = 'Refusée'; dire(t); break;
      case 'clore': x.statut = 'Close'; if (texte(t)) dire(t); break;
      default: refus('Action inconnue : ' + action);
    }
    x.maj = maintenant(); return x;
  });
}

module.exports = { lire, recevoir, validation, ceo, directeur, ouverte, STATUTS, FINIS, ID, ErreurDemande };
