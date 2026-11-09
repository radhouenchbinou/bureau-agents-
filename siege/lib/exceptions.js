// Registre des exceptions aux droits des agents, hors du dépôt : ~/.siege/exceptions.json (droits 600).
// Cycle : demandee (directeur) → accordee | refusee (CEO uniquement) → active (directeur) → terminee
// (automatiquement quand l'agent termine sa tâche, ou par le directeur). Une exception ne couvre qu'un agent,
// un type d'action (bash, ecriture, lecture, web, outil) et un motif précis.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const PRIVE = () => process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege');
const FICHIER = () => path.join(PRIVE(), 'exceptions.json');
const TYPES = ['bash', 'ecriture', 'lecture', 'web', 'outil'];
const AGENT = /^[a-z][a-z0-9-]{1,40}$/;
const ID = /^EXC-\d{3,}$/;

class ErreurException extends Error {}
const refus = m => { throw new ErreurException(m); };
const maintenant = () => new Date().toISOString();

function lire() { try { const j = JSON.parse(fs.readFileSync(FICHIER(), 'utf8')); return { seq: j.seq || 0, liste: Array.isArray(j.liste) ? j.liste : [] }; } catch { return { seq: 0, liste: [] }; } }
// Écriture atomique ; un verrou fichier simple évite deux écritures simultanées (hooks parallèles)
function modifier(f) {
  fs.mkdirSync(PRIVE(), { recursive: true, mode: 0o700 });
  const verrou = FICHIER() + '.lock'; let fd, essais = 0;
  for (;;) { try { fd = fs.openSync(verrou, 'wx', 0o600); break; } catch (e) { if (e.code !== 'EEXIST' || ++essais > 100) { try { if (Date.now() - fs.statSync(verrou).mtimeMs > 10e3) { fs.unlinkSync(verrou); continue; } } catch {} refus('Registre des exceptions occupé'); } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20); } }
  try {
    const r = lire(), res = f(r);
    const tmp = FICHIER() + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(r, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(tmp, FICHIER());
    return res;
  } finally { fs.closeSync(fd); fs.unlinkSync(verrou); }
}
const trouver = (r, id) => r.liste.find(e => e.id === id) || refus('Exception introuvable : ' + id);
const texte = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function demander({ agent, ticket, type, motif, justification }) {
  if (!AGENT.test(agent || '')) refus('Agent invalide');
  if (!TYPES.includes(type)) refus('Type : ' + TYPES.join(', '));
  motif = texte(motif, 300); if (!motif) refus('Motif obligatoire : la commande, le chemin ou le domaine exact');
  if (type === 'bash' && motif.length < 6) refus('Motif de commande trop large');
  if (/^\*+$|^\/$|^\*\*/.test(motif)) refus('Motif trop large : une exception vise une action précise');
  justification = texte(justification, 1000); if (justification.length < 15) refus('Justification obligatoire (pourquoi cette action est nécessaire pour la tâche)');
  if (ticket && !/^([A-Z]{3}-\d{3}|BUG-\d{3})$/.test(ticket)) refus('Ticket invalide');
  return modifier(r => { const e = { id: 'EXC-' + String(++r.seq).padStart(3, '0'), agent, ticket: ticket || '', type, motif, justification, statut: 'demandee', demandee_le: maintenant() }; r.liste.push(e); return e; });
}
// Réservé au CEO : appelé par le serveur du Siège ou en ligne de commande par un humain (la garde l'interdit aux agents)
function decider(id, accord, commentaire = '') {
  return modifier(r => {
    const e = trouver(r, id); if (e.statut !== 'demandee') refus(`${id} est « ${e.statut} » : seule une demande en attente se décide`);
    Object.assign(e, { statut: accord ? 'accordee' : 'refusee', decidee_le: maintenant(), decidee_par: 'CEO', commentaire_ceo: texte(commentaire, 500) });
    return e;
  });
}
function activer(id) {
  return modifier(r => { const e = trouver(r, id); if (e.statut !== 'accordee') refus(`${id} n'est pas accordée par le CEO (statut : ${e.statut})`); Object.assign(e, { statut: 'active', activee_le: maintenant() }); return e; });
}
function terminer(id, raison = 'terminée par le directeur') {
  return modifier(r => { const e = trouver(r, id); if (!['active', 'accordee'].includes(e.statut)) refus(`${id} n'est pas en cours`); Object.assign(e, { statut: 'terminee', terminee_le: maintenant(), fin: raison }); return e; });
}
// Fin de tâche d'un agent : toutes ses exceptions actives se ferment
function terminerPourAgent(agent) {
  const r0 = lire(); if (!r0.liste.some(e => e.agent === agent && e.statut === 'active')) return [];
  return modifier(r => r.liste.filter(e => e.agent === agent && e.statut === 'active').map(e => Object.assign(e, { statut: 'terminee', terminee_le: maintenant(), fin: 'tâche de l\'agent terminée' })));
}
const actives = agent => lire().liste.filter(e => e.agent === agent && e.statut === 'active');
function noterUsage(id) { try { modifier(r => { const e = r.liste.find(x => x.id === id); if (e) { e.utilisations = (e.utilisations || 0) + 1; e.derniere_utilisation = maintenant(); } }); } catch {} }

module.exports = { lire, demander, decider, activer, terminer, terminerPourAgent, actives, noterUsage, TYPES, ID, ErreurException, FICHIER };
