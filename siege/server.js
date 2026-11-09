#!/usr/bin/env node
// Le Siège : interface locale de l'entreprise d'agents. Bureau des équipes (activité réelle lue dans Claude Code),
// agents modifiables, backlog Features / Bugs (fichiers locaux ou Notion) et lancement d'un circuit dans Claude Code.
// Node 18+, aucune dépendance npm. N'écoute que sur 127.0.0.1.
'use strict';
const http = require('http'), fsp = require('fs').promises, path = require('path'), crypto = require('crypto'), { execFile } = require('child_process');
const cfg = require('./lib/config');
const { COLLECTIONS, ETAPES, ErreurBacklog, file, reclasser, prochainId } = require('./lib/backlog');
const { Agents, MODELES, OUTILS, ROLES_FILIALE } = require('./lib/agents');
const { filiales } = require('./lib/registre');
const activite = require('./lib/activite');
const { creerBases, idDepuisLien } = require('./lib/notion');
const { questionsOuvertes } = require('./backlog');
const exceptions = require('./lib/exceptions'), parametres = require('./lib/parametres'), skills = require('./lib/skills'), droits = require('./droits');
const fs = require('fs'), os = require('os');

// Derniers événements de la garde (refus, exceptions utilisées ou terminées), du plus récent au plus ancien
function journalGarde(n = 40) {
  try {
    const f = path.join(process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege'), 'journal-garde.jsonl');
    const t = fs.readFileSync(f, 'utf8').trim().split('\n').slice(-n).reverse();
    return t.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
function vueDroits() {
  const p = droits.politique();
  return {
    roles: Object.entries(p.roles).map(([nom, r]) => ({ nom, libelle: r.libelle, outils: [...new Set([...p.commun.outils_toujours, ...r.outils])], ecriture: r.ecriture,
      commandes: [...p.commun.bash, ...r.bash].length, github: r.github, skills: [...(p.commun.skills || []), ...(r.skills || [])], skillsEntreprise: r.skills_entreprise || [] })),
    exceptions: exceptions.lire().liste.slice().reverse(), journal: journalGarde(), autorisations: parametres.lire(cfg.F.racine),
    domainesBase: parametres.DOMAINES_BASE, skills: skills.lister(cfg.F.racine)
  };
}

const PORT = Number(process.env.SIEGE_PORT || 4848), HOST = '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');
const CSRF = crypto.randomBytes(24).toString('hex');
const agents = new Agents(cfg.F.agents);
const egal = (a, b) => typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const refus = m => { throw new ErreurBacklog(m); };

async function lireCollection(nom) {
  try { return { elements: await cfg.source(nom).lister() }; }
  catch (e) { return { elements: [], erreur: e instanceof ErreurBacklog ? e.message : 'Lecture impossible : ' + e.message }; }
}

// Questions des agents sans réponse : coûteux sur Notion (un appel par ticket actif), donc relu au plus toutes les 60 s
let questions = { liste: [], a: 0, erreur: null };
async function questionsEnAttente(forcer) {
  if (!forcer && Date.now() - questions.a < 60e3) return questions;
  try { questions = { liste: await questionsOuvertes(), a: Date.now(), erreur: null }; }
  catch (e) { questions = { liste: questions.liste, a: Date.now(), erreur: e.message }; }
  return questions;
}

async function etat() {
  const [fil, ag, f, b, act] = await Promise.all([filiales(cfg.F.filiales), agents.lister(), lireCollection('features'), lireCollection('bugs'),
    activite.lire({ racine: cfg.F.racine }).catch(e => ({ direction: { etat: 'absent' }, sessions: [], missions: [], erreur: e.message }))]);
  const s = cfg.lireSource();
  return {
    csrf: CSRF, genere: Date.now(), racine: cfg.F.racine,
    source: { type: s.type, jeton: !!cfg.jeton(), configure: s.type !== 'notion' || !!(s.bases && s.bases.features && s.bases.bugs) },
    schemas: Object.fromEntries(Object.entries(COLLECTIONS).map(([n, c]) => [n, { libelle: c.libelle, champs: c.champs }])), etapes: ETAPES,
    filiales: fil, agents: ag, rolesFiliale: ROLES_FILIALE, modeles: MODELES, outils: OUTILS,
    features: f, bugs: b, file: file(f.elements, b.elements), activite: act, questions: await questionsEnAttente(),
    droits: (() => { try { return vueDroits(); } catch (e) { return { erreur: e.message, roles: [], exceptions: [], journal: [], autorisations: { liste: [] }, skills: [] }; } })()
  };
}

// Ouvre un Terminal (macOS) dans le Siège avec Claude Code lancé sur la commande du circuit ; ailleurs, renvoie la commande
function lancer(commande) {
  const racine = cfg.F.racine;
  if (/['"\\\n]/.test(racine)) refus('Chemin du Siège non pris en charge pour le lancement automatique');
  const shell = `cd '${racine}' && claude '${commande}'`;
  if (process.platform !== 'darwin') return Promise.resolve({ lance: false, commande: shell });
  const script = `tell application "Terminal"\nactivate\ndo script "${shell}"\nend tell`;
  return new Promise(ok => execFile('osascript', ['-e', script], { timeout: 10e3 }, err => ok({ lance: !err, commande: shell })));
}

async function action(op) {
  if (!op || typeof op.op !== 'string') refus('Opération manquante');
  const n = op.collection;
  switch (op.op) {
    case 'ticket.creer': {
      if (!COLLECTIONS[n]) refus('Collection inconnue');
      const fil = (await filiales(cfg.F.filiales)).find(f => f.nom === op.ticket.filiale) || refus('Choisissez une filiale');
      const src = cfg.source(n), id = prochainId(n, await src.lister(), fil.prefixe);
      return src.creer({ ...op.ticket, id });
    }
    case 'ticket.modifier': if (!COLLECTIONS[n]) refus('Collection inconnue'); return cfg.source(n).modifier(op.id, op.champs || {});
    case 'ticket.supprimer': if (!COLLECTIONS[n]) refus('Collection inconnue'); return cfg.source(n).supprimer(op.id);
    case 'ticket.commenter': {
      if (!COLLECTIONS[n]) refus('Collection inconnue');
      const c = await cfg.source(n).commenter(op.id, { auteur: 'CEO', type: 'reponse', texte: op.texte });
      questions.a = 0; return c;
    }
    case 'ticket.reclasser': {
      if (!COLLECTIONS[n] || !Array.isArray(op.ids)) refus('Ordre manquant');
      const src = cfg.source(n), changes = reclasser(await src.lister(), op.ids.slice(0, 500));
      for (const c of changes) await src.modifier(c.id, { rang: c.rang });
      return { modifies: changes.length };
    }
    // Outils et skills d'un agent viennent de droits/roles.json : l'éditeur ne change que description, modèle, consigne.
    // Un nouvel agent reçoit des droits minimaux (lecture seule) que le CEO élargit ensuite dans droits/roles.json.
    case 'agent.creer': {
      const a = op.agent || {}, r = await agents.ecrire({ ...a, outils: ['Read', 'Grep', 'Glob'], skills: [] }, { creation: true });
      const f = path.join(cfg.F.racine, 'droits', 'roles.json'), p = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!p.roles[r.nom]) { p.roles[r.nom] = { libelle: r.nom, outils: [], ecriture: [], bash: [], web: [], github: {}, skills: [] }; fs.writeFileSync(f + '.tmp', JSON.stringify(p, null, 2) + '\n'); fs.renameSync(f + '.tmp', f); }
      await droits.appliquer({ silencieux: true }); return r;
    }
    case 'agent.modifier': {
      const a = op.agent || {}, ex0 = (await agents.lister()).find(x => x.nom === a.nom) || refus('Agent introuvable');
      return agents.ecrire({ ...ex0, description: a.description, modele: a.modele, consigne: a.consigne }, { creation: false });
    }
    case 'agent.supprimer': {
      await agents.supprimer(op.nom);
      const f = path.join(cfg.F.racine, 'droits', 'roles.json'), p = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (p.roles[op.nom] && op.nom !== 'directeur') { delete p.roles[op.nom]; fs.writeFileSync(f + '.tmp', JSON.stringify(p, null, 2) + '\n'); fs.renameSync(f + '.tmp', f); }
      return { ok: true };
    }
    case 'notion.jeton': await cfg.enregistrerJeton(op.jeton); return { ok: true };
    case 'notion.init': {
      const page = idDepuisLien(op.page) || refus('Collez l\'URL d\'une page Notion partagée avec l\'intégration');
      const s = cfg.lireSource(); if (s.type === 'notion' && s.bases) refus('Notion est déjà configuré');
      const fil = (await filiales(cfg.F.filiales)).map(f => f.nom), locales = cfg.sourcesLocales();
      const jalons = [...new Set((await locales.features.lister()).map(e => e.jalon).filter(Boolean))];
      const bases = await creerBases({ jeton: cfg.jeton(), pageParente: page, filiales: fil, jalons });
      await cfg.ecrireSource({ type: 'notion', page, bases }); return { bases };
    }
    case 'notion.importer': {
      if (cfg.lireSource().type !== 'notion') refus('Configurez Notion d\'abord');
      const locales = cfg.sourcesLocales(), bilan = {};
      for (const c of Object.keys(COLLECTIONS)) {
        const cible = cfg.source(c), deja = new Set((await cible.lister()).map(e => e.id)); bilan[c] = 0;
        for (const e of await locales[c].lister()) if (!deja.has(e.id)) { const { notion, ...sans } = e; await cible.creer(sans); bilan[c]++; }
      }
      return bilan;
    }
    case 'source.fichier': await cfg.ecrireSource({ type: 'fichier' }); return { ok: true };
    // Décisions réservées au CEO : seul ce serveur local (ou un humain en terminal) peut les prendre
    case 'exception.accorder': return exceptions.decider(String(op.id || ''), true, op.commentaire);
    case 'exception.refuser': return exceptions.decider(String(op.id || ''), false, op.commentaire);
    case 'exception.terminer': return exceptions.terminer(String(op.id || ''), 'terminée par le CEO');
    case 'autorisation.ajouter': { const r = parametres.ajouter(cfg.F.racine, op, Object.keys(droits.politique().roles)); return r; }
    case 'autorisation.retirer': parametres.retirer(cfg.F.racine, String(op.id || '')); return { ok: true };
    case 'sandbox.obligatoire': parametres.sandboxObligatoire(cfg.F.racine, !!op.oui); return { ok: true };
    case 'skill.creer': skills.creer(cfg.F.racine, op.skill || {}); await droits.appliquer({ silencieux: true }); return { ok: true };
    case 'skill.affecter': skills.affecter(cfg.F.racine, op); await droits.appliquer({ silencieux: true }); return { ok: true };
    case 'skill.supprimer': skills.supprimer(cfg.F.racine, op.nom); await droits.appliquer({ silencieux: true }); return { ok: true };
    case 'lancer': {
      const id = String(op.id || '');
      if (/^BUG-\d{3}$/.test(id)) return lancer('/corriger ' + id);
      if (!/^[A-Z]{3}-\d{3}$/.test(id)) refus('Identifiant invalide');
      return lancer('/feature ' + id);
    }
    default: refus('Opération inconnue : ' + op.op);
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
function corps(req, max = 64 << 10) {
  return new Promise((ok, ko) => { let n = 0; const b = []; req.on('data', c => { n += c.length; if (n > max) { ko(new ErreurBacklog('Requête trop grosse')); req.destroy(); } else b.push(c); }); req.on('end', () => ok(Buffer.concat(b).toString('utf8'))); req.on('error', ko); });
}

const serveur = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const envoyer = (code, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  // Anti DNS rebinding : seul l'hôte local est servi
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return envoyer(403, { erreur: 'Hôte refusé' });
  try {
    if (u.pathname === '/api/etat' && req.method === 'GET') return envoyer(200, await etat());
    if (u.pathname === '/api/commentaires' && req.method === 'GET') {
      const id = u.searchParams.get('id') || '';
      if (!/^([A-Z]{3}-\d{3}|BUG-\d{3})$/.test(id)) return envoyer(400, { erreur: 'Identifiant invalide' });
      try { return envoyer(200, { commentaires: await cfg.source(/^BUG-/.test(id) ? 'bugs' : 'features').commentaires(id) }); }
      catch (e) { if (e instanceof ErreurBacklog) return envoyer(400, { erreur: e.message }); throw e; }
    }
    if (u.pathname === '/api/action' && req.method === 'POST') {
      const origine = req.headers.origin;
      if (origine && new URL(origine).host !== req.headers.host) return envoyer(403, { erreur: 'Origine refusée' });
      if (!egal(req.headers['x-siege-csrf'], CSRF) || !/^application\/json/.test(req.headers['content-type'] || '')) return envoyer(403, { erreur: 'Jeton de page manquant : rechargez la page' });
      let op; try { op = JSON.parse(await corps(req)); } catch { return envoyer(400, { erreur: 'Requête illisible' }); }
      try { return envoyer(200, { ok: true, resultat: (await action(op)) || null }); }
      catch (e) { if (e instanceof ErreurBacklog || e instanceof exceptions.ErreurException) return envoyer(400, { erreur: e.message }); throw e; }
    }
    if (req.method !== 'GET') return envoyer(405, { erreur: 'Méthode refusée' });
    const rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const f = path.resolve(PUBLIC, rel);
    if (!f.startsWith(PUBLIC + path.sep)) return envoyer(404, 'Introuvable', 'text/plain; charset=utf-8');
    fsp.readFile(f).then(b => envoyer(200, b, TYPES[path.extname(f)] || 'application/octet-stream'), () => envoyer(404, 'Introuvable', 'text/plain; charset=utf-8'));
  } catch (e) { console.error(e); envoyer(500, { erreur: 'Erreur interne' }); }
});

if (require.main === module) serveur.listen(PORT, HOST, () => console.log(`Le Siège : http://${HOST}:${PORT}/  (racine ${cfg.F.racine})`));
module.exports = { serveur, action, etat };
