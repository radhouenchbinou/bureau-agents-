// Journal de logs par agent IA (EIA-017) : un fichier JSON Lines par rôle, ~/.siege/journaux/agents/<rôle>.jsonl,
// écrit par le Siège seul (garde, agent.js, messagerie, exceptions, serveur) ; jamais lu ni écrit par un agent.
// Une ligne = un fait : ouverture (lancement), evenement (garde / exception), cloture (fin). L'état d'une entrée est
// le repli des lignes de même id. Le masquage des secrets se fait ICI, avant l'écriture (R5).
// Aucune fonction d'écriture ne lève : une défaillance est signalée par un témoin, jamais à l'agent (R8).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');

const V = 1, ROLE = /^[a-z][a-z0-9-]{1,40}$/, TICKET = /^([A-Z]{3}-\d{3}|BUG-\d{3})$/, ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_EXTRAIT = 2000, MARQUE = '\n[tronqué]', FENETRE = 16000, MAX_CHAMP = 300;
const ATTENTE_VERROU_MS = 500, VERROU_PERIME_MS = 10e3, HOTE_MAX_MS = 2 * 3600e3;
const NATURES = ['refus', 'exception_demandee', 'exception_accordee', 'exception_refusee', 'exception_activee', 'exception_utilisee', 'exception_terminee'];
const DEFAUT = { jours: 90, max: 500 };
const MASQUE = '[MASQUÉ]';

const PRIVE = () => process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege');
const DOSSIER = () => path.join(PRIVE(), 'journaux', 'agents');
const FICHIER = role => path.join(DOSSIER(), role + '.jsonl');
const TEMOIN = () => path.join(os.tmpdir(), `siege-journal-erreur-${typeof process.getuid === 'function' ? process.getuid() : 'x'}.json`);
const iso = d => new Date(d === undefined ? Date.now() : d).toISOString();
const dormir = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// ---------- Réglages (droits/autorisations.json › journalAgents, bornés) ----------
function normaliserReglages(x) {
  const n = (v, d, min, max) => { v = Number(v); return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : d; };
  x = x && typeof x === 'object' ? x : {};
  return { actif: x.actif !== false, jours: n(x.jours, DEFAUT.jours, 1, 3650), max: n(x.max, DEFAUT.max, 10, 10000) };
}
function reglages() {
  try { return normaliserReglages(require('./parametres').lire(process.env.SIEGE_RACINE || path.resolve(__dirname, '..', '..')).journalAgents); }
  catch { return normaliserReglages({}); }
}

// ---------- Masquage (R5) et bornage (R6) ----------
const NOM = '[A-Za-z0-9_.-]*(?:TOKEN|KEY|SECRET|PASSWORD|PASSWD)[A-Za-z0-9_.-]*';
const MOTIFS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, MASQUE],
  [/((?:Proxy-)?Authorization)\s*:\s*(?:(?:Bearer|Basic|Digest|token)\s+)?[^\s"'\\]+/gi, `$1: ${MASQUE}`],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, MASQUE], [/github_pat_[A-Za-z0-9_]{20,}/g, MASQUE], [/sk-[A-Za-z0-9_-]{16,}/g, MASQUE],
  [/xox[abprs]-[A-Za-z0-9-]{10,}/g, MASQUE], [/\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g, MASQUE], [/(?:secret|ntn)_[A-Za-z0-9]{30,}/g, MASQUE],
  [new RegExp(`("${NOM}"\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|[^\\s,}]+)`, 'gi'), `$1"${MASQUE}"`],
  [new RegExp(`(--${NOM.replace('[A-Za-z0-9_.-]*', '[A-Za-z0-9_-]*')})(\\s+)("[^"]*"|'[^']*'|[^\\s"'-][^\\s"']*)`, 'gi'), `$1$2${MASQUE}`],
  [new RegExp(`(\\b${NOM}\\s*[=:]\\s*)("[^"]*"|'[^']*'|[^\\s"',;]+)`, 'gi'), `$1${MASQUE}`]
];
function masquer(s) {
  let t = String(s === null || s === undefined ? '' : s);
  for (const [re, r] of MOTIFS) t = t.replace(re, r);
  // Valeurs réelles des variables d'environnement sensibles du processus écrivain, même hors de toute affectation
  const valeurs = Object.entries(process.env).filter(([k, v]) => /TOKEN|KEY|SECRET|PASSWORD|PASSWD/i.test(k) && String(v).length >= 8).map(([, v]) => String(v)).sort((a, b) => b.length - a.length);
  for (const v of valeurs) if (t.includes(v)) t = t.split(v).join(MASQUE);
  return t;
}
const sansControle = s => String(s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
// Dernière tranche sans demi-caractère (paire de substituts coupée)
const fin = (s, n) => { let t = s.slice(-n); if (/^[\udc00-\udfff]/.test(t)) t = t.slice(1); return t; };
function borner(sortie) {
  const brut = sansControle(sortie === null || sortie === undefined ? '' : sortie), coupe = brut.length > FENETRE;
  const t = masquer(fin(brut, FENETRE));
  if (!coupe && t.length <= MAX_EXTRAIT) return { extrait: t, tronque: false };
  return { extrait: fin(t, MAX_EXTRAIT - MARQUE.length) + MARQUE, tronque: true };
}
// Champ texte court : contrôles remplacés, secrets masqués, longueur bornée
const champ = (s, max = MAX_CHAMP) => { const t = masquer(String(s === null || s === undefined ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ')).trim(); return t.length > max ? fin(t.slice(0, max), max) : t; };

// ---------- Défaillance d'écriture : témoin, jamais d'exception (R8) ----------
function signaler(role, e) {
  const m = e && e.message ? e.message : String(e);
  try { fs.writeFileSync(TEMOIN(), JSON.stringify({ date: iso(), role: String(role || ''), erreur: m.slice(0, 300) }) + '\n', { mode: 0o600 }); }
  catch { try { process.stderr.write('Journal des agents : écriture impossible (' + m.slice(0, 120) + ')\n'); } catch {} }
}
function erreurJournal() { try { const j = JSON.parse(fs.readFileSync(TEMOIN(), 'utf8')); return j && j.date ? j : null; } catch { return null; } }
function effacerErreur() { try { fs.unlinkSync(TEMOIN()); } catch {} }

// ---------- Écriture sous verrou ----------
function avecVerrou(role, f) {
  fs.mkdirSync(DOSSIER(), { recursive: true, mode: 0o700 });
  const verrou = FICHIER(role) + '.lock', limite = Date.now() + ATTENTE_VERROU_MS; let fd;
  for (;;) {
    try { fd = fs.openSync(verrou, 'wx', 0o600); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(verrou).mtimeMs > VERROU_PERIME_MS) { fs.unlinkSync(verrou); continue; } } catch {}
      if (Date.now() >= limite) throw new Error('Journal occupé');
      dormir(20);
    }
  }
  try { return f(); } finally { try { fs.closeSync(fd); } catch {} try { fs.unlinkSync(verrou); } catch {} }
}
function ajouter(role, objet) {
  try {
    if (!ROLE.test(role || '') || !reglages().actif) return false;
    const ligne = JSON.stringify({ v: V, ...objet }) + '\n';
    avecVerrou(role, () => fs.appendFileSync(FICHIER(role), ligne, { mode: 0o600 }));
    return true;
  } catch (e) { signaler(role, e); return false; }
}

// ---------- Producteurs ----------
// Un lancement = une entrée « en cours » ; renvoie son id (ou null si rien n'a pu être écrit)
function ouvrir({ role, filiale, ticket, etape, moteur, modele, debut, hote, empreinte, id } = {}) {
  try {
    if (!ROLE.test(role || '')) return null;
    id = id && ID.test(id) ? id : crypto.randomUUID();
    const l = { type: 'ouverture', id, role, filiale: champ(filiale), ticket: TICKET.test(ticket || '') ? ticket : '', etape: champ(etape, 60), moteur: champ(moteur, 40), modele: champ(modele, 80), debut: iso(debut) };
    l.hote = { pid: Number.isInteger(hote && hote.pid) ? hote.pid : process.pid, session: champ(hote && hote.session, 80) };
    if (empreinte) l.empreinte = champ(empreinte, 80);
    return ajouter(role, l) ? id : null;
  } catch (e) { signaler(role, e); return null; }
}
function evenement(role, id, { nature, outil, motif, raison, exception, incertain, date } = {}) {
  try {
    if (!ID.test(id || '') || !NATURES.includes(nature)) return false;
    const l = { type: 'evenement', id, date: iso(date), nature, outil: champ(outil, 40), motif: champ(motif), raison: champ(raison), exception: /^EXC-\d{3,}$/.test(exception || '') ? exception : '' };
    if (incertain) l.incertain = true;
    return ajouter(role, l);
  } catch (e) { signaler(role, e); return false; }
}
// etat : par défaut selon le code (0 = terminé, sinon échec) ; interrompu = tué, délai dépassé ou hôte mort
function clore(role, id, { fin: finDate, duree, etat, code, sortie } = {}) {
  try {
    if (!ID.test(id || '')) return false;
    const f = finDate === undefined ? Date.now() : Date.parse(finDate) || Date.now();
    if (duree === undefined) { const e = entree(role, id); duree = e ? (f - Date.parse(e.debut)) / 1000 : 0; }
    duree = Math.max(0, Math.round(Number(duree) || 0));
    const c = code === null || code === undefined ? null : Number.isInteger(code) ? code : null;
    etat = etat || (c === 0 ? 'terminé' : 'échec');
    const x = borner(sortie);
    return ajouter(role, { type: 'cloture', id, fin: iso(f), duree, etat, code: c, extrait: x.extrait, tronque: x.tronque });
  } catch (e) { signaler(role, e); return false; }
}

// ---------- Lecture : repli des lignes ----------
function replier(role) {
  const out = { liste: [], ignorees: 0 };
  if (!ROLE.test(role || '')) return out;
  let texte; try { texte = fs.readFileSync(FICHIER(role), 'utf8'); } catch { return out; }
  const par = new Map();
  for (const l of texte.split('\n')) {
    if (!l.trim()) continue;
    let j; try { j = JSON.parse(l); } catch { out.ignorees++; continue; }
    if (!j || typeof j !== 'object' || j.v !== V) { out.ignorees++; continue; }
    if (j.type === 'ouverture') {
      if (par.has(j.id)) continue;   // doublon d'id : la première gagne
      const e = { id: j.id, role: j.role, filiale: j.filiale || '', ticket: j.ticket || '', etape: j.etape || '', moteur: j.moteur || '', modele: j.modele || '', debut: j.debut, etat: 'en cours', extrait: '', tronque: false, evenements: [], hote: j.hote };
      if (j.empreinte) e.empreinte = j.empreinte;
      par.set(j.id, e); out.liste.push(e);
    } else if (j.type === 'evenement') {
      const e = par.get(j.id); if (!e) continue;
      const ev = { date: j.date, nature: j.nature, outil: j.outil || '', motif: j.motif || '', raison: j.raison || '', exception: j.exception || '' }; if (j.incertain) ev.incertain = true;
      e.evenements.push(ev);
    } else if (j.type === 'cloture') {
      const e = par.get(j.id); if (!e) continue;
      if (e.fin && !(e.etat === 'interrompu' && j.etat !== 'interrompu')) continue;   // une clôture réelle l'emporte sur « interrompu »
      Object.assign(e, { fin: j.fin, duree: Math.max(0, Math.round(j.duree) || 0), etat: j.etat, code: j.code === undefined ? null : j.code, extrait: j.extrait || '', tronque: !!j.tronque });
    } else out.ignorees++;
  }
  return out;
}
const entree = (role, id) => replier(role).liste.find(e => e.id === id) || null;
function roles() { try { return fs.readdirSync(DOSSIER()).filter(f => f.endsWith('.jsonl')).map(f => f.slice(0, -6)).filter(r => ROLE.test(r)); } catch { return []; } }
// Page d'entrées, la plus récente d'abord ; paramètres hors bornes ramenés à des valeurs valides
function lire(role, { depuis = 0, nombre = 20 } = {}) {
  const { liste, ignorees } = replier(role);
  const d = Math.max(0, Math.floor(Number(depuis)) || 0), n = Math.min(100, Math.max(1, Math.floor(Number(nombre)) || 20));
  const tri = liste.slice().reverse().sort((a, b) => Date.parse(b.debut) - Date.parse(a.debut));
  return { entrees: tri.slice(d, d + n), total: tri.length, suite: d + n < tri.length, ignorees };
}

// ---------- Réconciliation (CA3) : une entrée sans clôture dont l'hôte est mort, ou trop ancienne, devient « interrompu » ----------
const vivant = pid => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
function reconcilier(role) {
  let n = 0;
  for (const r of role ? [role] : roles()) {
    try {
      for (const e of replier(r).liste.filter(x => x.etat === 'en cours')) {
        const age = Date.now() - Date.parse(e.debut);
        if (vivant(e.hote && e.hote.pid) && age <= HOTE_MAX_MS) continue;
        if (clore(r, e.id, { etat: 'interrompu', code: null, duree: age / 1000, sortie: '' })) n++;
      }
    } catch (e) { signaler(r, e); }
  }
  return n;
}

// ---------- Rétention (CA18) : jours et max par agent ; une entrée « en cours » n'est jamais supprimée ----------
function purger(role, opts = {}) {
  const r = normaliserReglages({ ...reglages(), ...opts }), maintenant = opts.maintenant === undefined ? Date.now() : opts.maintenant;
  let retirees = 0;
  for (const ro of role ? [role] : roles()) {
    try {
      retirees += avecVerrou(ro, () => {
        const { liste } = replier(ro), sup = new Set();
        const closes = liste.filter(e => e.etat !== 'en cours');
        for (const e of closes) if (maintenant - Date.parse(e.debut) > r.jours * 864e5) sup.add(e.id);
        let reste = liste.length - sup.size;
        for (const e of closes.slice().sort((a, b) => Date.parse(a.debut) - Date.parse(b.debut))) { if (reste <= r.max) break; if (!sup.has(e.id)) { sup.add(e.id); reste--; } }
        if (!sup.size) return 0;
        const gardees = fs.readFileSync(FICHIER(ro), 'utf8').split('\n').filter(l => {
          if (!l.trim()) return false;
          let j; try { j = JSON.parse(l); } catch { return false; }
          return !(j && j.v === V && sup.has(j.id));
        });
        const tmp = FICHIER(ro) + '.' + process.pid + '.tmp';
        fs.writeFileSync(tmp, gardees.map(l => l + '\n').join(''), { mode: 0o600 }); fs.renameSync(tmp, FICHIER(ro));
        return sup.size;
      });
    } catch (e) { signaler(ro, e); }
  }
  return retirees;
}

// ---------- Rattachement des événements de garde (R4) ----------
const empreinteDe = t => 'sha256:' + crypto.createHash('sha256').update(String(t || '').trim()).digest('hex');
// Premier message utilisateur d'un historique de sous-agent (= la mission confiée), lu en tête de fichier seulement
function premierMessage(f) {
  try {
    const h = fs.openSync(f, 'r'), b = Buffer.alloc(256 << 10), n = fs.readSync(h, b, 0, b.length, 0); fs.closeSync(h);
    for (const l of b.toString('utf8', 0, n).split('\n')) {
      let j; try { j = JSON.parse(l); } catch { continue; }
      if (j.type !== 'user' || !j.message) continue;
      const c = j.message.content, t = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join('\n') : '';
      if (t) return t;
    }
  } catch {}
  return '';
}
// Dernier message de l'assistant dans un historique (fin de fichier seulement) : la passation du sous-agent
function dernierMessage(f) {
  try {
    const t = fs.statSync(f).size, h = fs.openSync(f, 'r'), n = Math.min(t, 512 << 10), b = Buffer.alloc(n); fs.readSync(h, b, 0, n, t - n); fs.closeSync(h);
    const lignes = b.toString('utf8').split('\n'); let dernier = '';
    for (const l of lignes) {
      let j; try { j = JSON.parse(l); } catch { continue; }
      if (!j || j.type !== 'assistant' || !j.message) continue;
      const c = j.message.content, x = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(y => y && y.type === 'text').map(y => y.text).join('\n') : '';
      if (x) dernier = x;
    }
    return dernier;
  } catch { return ''; }
}
function historiqueSousAgent(h) {
  if (h.agent_transcript_path) return h.agent_transcript_path;
  if (!h.agent_id || !h.session_id) return '';
  const base = process.env.SIEGE_CLAUDE_DIR || path.join(os.homedir(), '.claude'), racine = process.env.SIEGE_RACINE || path.resolve(__dirname, '..', '..');
  return path.join(base, 'projects', racine.replace(/[^a-zA-Z0-9]/g, '-'), h.session_id, 'subagents', h.agent_id + '.jsonl');
}
// Entrée du journal concernée par un événement : SIEGE_EXECUTION, sinon l'entrée ouverte du rôle (et de la session) ;
// s'il y en a plusieurs, l'empreinte du premier message du sous-agent, à défaut la plus récente avec « incertain ».
function rattacher(role, { execution, session, agentId, hook } = {}) {
  try {
    const { liste } = replier(role);
    if (execution && liste.some(e => e.id === execution)) return { id: execution, incertain: false };
    let c = liste.filter(e => e.etat === 'en cours');
    if (session) { const s = c.filter(e => e.hote && e.hote.session === session); if (s.length) c = s; }
    if (!c.length) return null;
    if (c.length === 1) return { id: c[0].id, incertain: false };
    const f = historiqueSousAgent(hook || { agent_id: agentId, session_id: session });
    const m = f && premierMessage(f);
    if (m) { const emp = empreinteDe(m), t = c.find(e => e.empreinte === emp); if (t) return { id: t.id, incertain: false }; }
    const r = c.slice().sort((a, b) => Date.parse(b.debut) - Date.parse(a.debut))[0];
    return { id: r.id, incertain: true };
  } catch { return null; }
}
// Dernière entrée du rôle pour un ticket, ouverte ou close (cycle d'une exception)
function derniere(role, ticket) {
  try { const l = replier(role).liste.filter(e => !ticket || e.ticket === ticket); return l.length ? l[l.length - 1].id : null; } catch { return null; }
}

module.exports = { ouvrir, evenement, clore, lire, replier, entree, roles, reconcilier, purger, masquer, borner, rattacher, derniere, empreinteDe, premierMessage, dernierMessage, historiqueSousAgent,
  normaliserReglages, reglages, erreurJournal, effacerErreur, FICHIER, DOSSIER, TEMOIN, ROLE, NATURES, MAX_EXTRAIT };
