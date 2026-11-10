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
const activite = require('./lib/activite'), journalAgents = require('./lib/journal-agents');
const { creerBases, idDepuisLien } = require('./lib/notion');
const { questionsOuvertes } = require('./backlog');
const exceptions = require('./lib/exceptions'), parametres = require('./lib/parametres'), skills = require('./lib/skills'), droits = require('./droits');
const fs = require('fs'), os = require('os');
const jira = require('./lib/jira'), integrations = require('./lib/integrations'), gh = require('./lib/github');
const moteurs = require('./lib/moteurs'), copilote = require('./lib/copilote');
const tm = require('./lib/teams');
const redaction = require('./lib/redaction'), modeLibre = require('./lib/mode-libre');
const tg = require('./lib/telegram'), sl = require('./lib/slack'), demandes = require('./lib/demandes'), canaux = require('./lib/canaux'), { Messagerie, commun, communModifier } = require('./lib/messagerie');

// Telegram : sujets dont le CEO est prévenu une fois chacun (questions d'agents, exceptions à décider)
async function sujetsCeo() {
  const out = [];
  for (const q of (await questionsEnAttente()).liste) out.push([`question:${q.id}:${q.question.date || q.question.texte.slice(0, 40)}`, `Question de ${q.question.auteur} sur ${q.id} (${q.titre}) :\n${q.question.texte.slice(0, 1500)}\n\nRépondez dans le Siège (Backlog › ${q.id}).`]);
  for (const e of exceptions.lire().liste.filter(x => x.statut === 'demandee')) out.push([`exception:${e.id}`, `Exception à décider : ${e.id} — ${e.agent}${e.ticket ? ' sur ' + e.ticket : ''}, ${e.type} « ${String(e.motif).slice(0, 200)} ».\nJustification : ${String(e.justification).slice(0, 500)}\nAccordez ou refusez dans Siège › Droits (jamais depuis Telegram).`]);
  const je = journalAgents.erreurJournal();   // écriture du journal des agents impossible (EIA-017, R8) : une fois par jour
  if (je) out.push([`journal-erreur:${String(je.date).slice(0, 10)}`, `Journal des agents : écriture impossible (${String(je.erreur).slice(0, 200)}). Les agents ne sont pas bloqués ; vérifiez le disque et les droits de ~/.siege/journaux.`]);
  return out;
}
const messagerie = new Messagerie({ racine: cfg.F.racine, journal: m => console.log('[telegram] ' + m), extras: sujetsCeo });
// Rédaction de tickets par l'IA (page Backlog) : contexte = filiales + tickets non terminés
const redacteur = new redaction.Redacteur({ racine: cfg.F.racine, journal: m => console.log('[rédaction] ' + m), contexte: async () => {
  const [fil, f, b] = await Promise.all([filiales(cfg.F.filiales), lireCollection('features'), lireCollection('bugs')]);
  const tickets = [...f.elements.filter(x => x.statut !== 'Livré'), ...b.elements.filter(x => !['Fermé', 'Rejeté'].includes(x.statut))].slice(0, 150)
    .map(x => ({ id: x.id, statut: x.statut, filiale: x.filiale, titre: x.titre }));
  return { filiales: fil.map(x => ({ nom: x.nom, prefixe: x.prefixe, dossier: x.dossier })), tickets };
} });
let botTelegram = '', equipeSlack = '', connexionTeams = null;   // connexion Teams en cours : { code, url, etat }

// Derniers événements de la garde (refus, exceptions utilisées ou terminées), du plus récent au plus ancien
function journalGarde(n = 40) {
  try {
    const f = path.join(process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege'), 'journal-garde.jsonl');
    const t = fs.readFileSync(f, 'utf8').trim().split('\n').slice(-n).reverse();
    return t.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}
function journalAdmin(ligne) {
  try { const d = process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege'); fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    fs.appendFileSync(path.join(d, 'journal-garde.jsonl'), JSON.stringify({ date: new Date().toISOString(), role: 'CEO', ...ligne }) + '\n', { mode: 0o600 }); } catch {}
}
// Fin du mode sans restriction à son échéance : réglages de Claude Code (bac à sable, interdictions) rétablis
let libreVu = null;
setInterval(async () => {
  const e = modeLibre.lire(cfg.F.racine);
  if (e.expire && libreVu !== e.jusqua) { libreVu = e.jusqua; modeLibre.desactiver(cfg.F.racine); journalAdmin({ evenement: 'mode_sans_restriction_expire' }); await droits.appliquer({ silencieux: true }).catch(() => {}); }
}, 30e3).unref();
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
    source: { type: s.type, jeton: s.type === 'jira' ? !!cfg.jetonJira() : !!cfg.jeton(), configure: s.type === 'notion' ? !!(s.bases && s.bases.features && s.bases.bugs) : s.type === 'jira' ? !!(s.champs && s.champs.ID) : true },
    telegram: (() => { const t = tg.lire(); return { actif: t.actif, jeton: !!tg.jeton(), bot: botTelegram, ceo: t.ceo, collaborateurs: t.collaborateurs, enAttente: t.enAttente }; })(),
    slack: (() => { const t = sl.lire(); return { actif: t.actif, jetonBot: !!sl.jetonBot(), jetonApp: !!sl.jetonApp(), disponible: sl.disponible(), equipe: equipeSlack,
      connecte: !!(messagerie.socket && messagerie.socket.ws && messagerie.socket.ws.readyState === 1), ceo: t.ceo, collaborateurs: t.collaborateurs, enAttente: t.enAttente, manifeste: sl.MANIFESTE }; })(),
    teams: (() => { const t = tm.lire(); return { actif: t.actif, tenant: t.tenant, clientId: t.clientId, moi: t.moi, connecte: tm.connecte(), connexion: connexionTeams,
      ceo: t.ceo, collaborateurs: t.collaborateurs, enAttente: t.enAttente }; })(),
    messagerie: (() => { const k = commun(); return { plafondJour: k.plafondJour || 50, sessionsAujourdhui: k.sessions[new Date().toISOString().slice(0, 10)] || 0,
      enCours: messagerie.enCours, file: messagerie.attente, canauxActifs: canaux.TOUS.filter(c => c.pret()).map(c => c.libelle) }; })(),
    demandes: demandes.lire().liste.slice(-200).reverse(),
    modeLibre: modeLibre.lire(cfg.F.racine),
    redactions: (() => { const l = redaction.lire().liste; return [...l.filter(redaction.OUVERTE), ...l.filter(x => !redaction.OUVERTE(x)).slice(-5)].reverse(); })(),
    integrations: integrations.vue({ racine: cfg.F.racine, prive: cfg.F.prive, source: s, jetonNotion: cfg.jeton(), jetonJira: cfg.jetonJira(), filiales: fil }),
    schemas: Object.fromEntries(Object.entries(COLLECTIONS).map(([n, c]) => [n, { libelle: c.libelle, champs: c.champs }])), etapes: ETAPES,
    filiales: fil, agents: ag, rolesFiliale: ROLES_FILIALE, outils: OUTILS,
    // Modèles des sous-agents Claude Code, avec ce que le CEO a désactivé ; moteurs d'agents détectés sur la machine
    modeles: MODELES.map(m => ({ id: m, actif: !m || m === 'inherit' || moteurs.autorise('claude', m).ok })),
    moteurs: await moteurs.detecter(),
    copilot: { ...copilote.lire(), jeton: !!copilote.jeton(), commande: copilote.commandeConnexion() },
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

// Champs tenus par les outils (ex. PR, par siege/github.js) : jamais modifiés depuis l'interface
const sansAuto = (n, champs) => Object.fromEntries(Object.entries(champs).filter(([k]) => !(COLLECTIONS[n].champs[k] || {}).auto));
async function action(op) {
  if (!op || typeof op.op !== 'string') refus('Opération manquante');
  const n = op.collection;
  switch (op.op) {
    case 'ticket.creer': {
      if (!op.ticket || typeof op.ticket !== 'object') refus('Ticket manquant');
      if (!COLLECTIONS[n]) refus('Collection inconnue');
      const fil = (await filiales(cfg.F.filiales)).find(f => f.nom === op.ticket.filiale) || refus('Choisissez une filiale');
      const src = cfg.source(n), id = prochainId(n, await src.lister(), fil.prefixe);
      return src.creer({ ...sansAuto(n, op.ticket), id });
    }
    // Admin : mode sans restriction (CEO seulement, confirmation tapée) ; réglages Claude Code régénérés aussitôt
    case 'admin.modeLibre': {
      if (op.actif) {
        if (op.confirmation !== 'SANS RESTRICTION') refus('Tapez SANS RESTRICTION pour confirmer');
        const e = modeLibre.activer(cfg.F.racine, op.duree_h);
        journalAdmin({ evenement: 'mode_sans_restriction_active', jusqua: e.jusqua });
        await droits.appliquer({ silencieux: true }); return e;
      }
      const e = modeLibre.desactiver(cfg.F.racine);
      journalAdmin({ evenement: 'mode_sans_restriction_desactive' });
      await droits.appliquer({ silencieux: true }); return e;
    }
    // Demande en langage courant → proposition rédigée par l'IA → validation du CEO → ticket
    case 'redaction.demander': { const x = redaction.demander(op.texte); redacteur.suivant(); return x; }
    case 'redaction.corriger': { const x = redaction.corriger(op.id, op.remarque); redacteur.suivant(); return x; }
    case 'redaction.abandonner': return redaction.abandonner(op.id);
    case 'redaction.valider': {
      const x = redaction.lire().liste.find(y => y.id === op.id) || refus('Rédaction introuvable');
      if (x.statut !== 'À valider') refus(`${x.id} est « ${x.statut} »`);
      const fil = await filiales(cfg.F.filiales), { collection, champs } = redaction.propositionValidee(op.proposition, fil.map(f => f.nom));
      const f = fil.find(y => y.nom === champs.filiale), src = cfg.source(collection), id = prochainId(collection, await src.lister(), f.prefixe);
      const t = await src.creer({ ...champs, id });
      await src.commenter(t.id, { auteur: 'directeur', type: 'suivi', texte: `Ticket rédigé par l'IA à partir de la demande ${x.id} du CEO, relu et validé par le CEO. Demande d'origine : « ${x.demande.slice(0, 1500)} »` }).catch(() => {});
      redaction.marquerCreee(x.id, t.id);
      return { id: t.id, collection };
    }
    case 'ticket.modifier': if (!COLLECTIONS[n]) refus('Collection inconnue'); return cfg.source(n).modifier(op.id, sansAuto(n, op.champs || {}));
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
      await cfg.ecrireSource({ ...s, type: 'notion', page, bases }); return { bases };
    }
    // Jira : jeton gardé dans ~/.siege ; l'initialisation crée les champs « Siège … » (droits d'admin Jira) et active Jira
    case 'jira.jeton': await cfg.enregistrerJetonJira(op.jeton); return { ok: true };
    case 'jira.init': {
      const c = jira.verifierConfig({ type: 'jira', url: String(op.url || '').trim(), mode: op.mode, email: String(op.email || '').trim(), projet: String(op.projet || '').trim().toUpperCase(),
        etiquette: String(op.etiquette || 'bureau-ia').trim(), types: { features: String(op.typeFeature || 'Story').trim(), bugs: String(op.typeBug || 'Bug').trim() }, restreindre: !!op.restreindre,
        statuts: Object.fromEntries(Object.entries(op.statuts || {}).filter(([k, v]) => COLLECTIONS.features.champs.statut.options.concat(COLLECTIONS.bugs.champs.statut.options).includes(k) && typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim().slice(0, 60)])) });
      const r = await jira.initialiser(c, cfg.jetonJira());
      const { bases, page } = cfg.lireSource();
      await cfg.ecrireSource({ ...r.config, ...(bases ? { bases, page } : {}) });
      return { moi: r.moi, crees: r.crees, avertissements: r.avertissements };
    }
    case 'source.jira': {
      const s = cfg.lireSource(); if (!(s.champs && s.champs.ID)) refus('Initialisez Jira d\'abord');
      await cfg.ecrireSource({ ...s, type: 'jira' }); return { ok: true };
    }
    case 'source.notion': {
      const s = cfg.lireSource(); if (!(s.bases && s.bases.features)) refus('Créez d\'abord les bases Notion');
      await cfg.ecrireSource({ ...s, type: 'notion' }); return { ok: true };
    }
    // App GitHub : identifiants et repos par filiale (portfolio/github.json), clé privée dans ~/.siege (600)
    case 'github.config': return integrations.configurerGithub(cfg.F.racine, await filiales(cfg.F.filiales), op);
    case 'github.cle': integrations.enregistrerCle(cfg.F.prive, op.pem); return { ok: true };
    case 'github.tester': return integrations.testerGithub(cfg.F.racine);
    // Clone d'un dépôt GitHub dans projets/ (adresse de l'entreprise seulement)
    case 'repo.cloner': return require('./lib/clonage').cloner({ racine: cfg.F.racine, url: op.url, nom: op.nom, hote: gh.urlConfiguree() || 'https://github.com' });
    // Telegram (option) : bot, CEO, collaborateurs autorisés, plafond de sessions automatiques du directeur
    case 'telegram.jeton': tg.enregistrerJeton(op.jeton); return { ok: true };
    case 'telegram.tester': { const m = await tg.appel('getMe'); botTelegram = m.username || ''; return { bot: botTelegram }; }
    case 'telegram.activer': {
      if (op.oui && !tg.jeton()) refus('Enregistrez d\'abord le jeton du bot');
      tg.modifier(s => { s.actif = !!op.oui; }); if (op.oui) messagerie.demarrer(); return { ok: true };
    }
    // Personnes d'un canal (Telegram : identifiant numérique ; Slack : U…) : CEO, collaborateur autorisé, retrait
    case 'telegram.ceo': case 'telegram.autoriser': case 'slack.ceo': case 'slack.autoriser': case 'teams.ceo': case 'teams.autoriser': {
      const [nomCanal, quoi] = op.op.split('.'), c = canaux[nomCanal];
      const id = nomCanal === 'telegram' ? Number(op.id) : String(op.id || ''), nom = String(op.nom || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80);
      if (nomCanal === 'slack' && !sl.ID.test(id)) refus('Identifiant Slack attendu (U…)');
      if (nomCanal === 'teams' && !tm.GUID.test(id)) refus('Identifiant Microsoft 365 attendu');
      const p = c.modifier(s => {
        const meme = x => x && String(x.id) === String(id);
        const v = s.enAttente.find(meme) || s.collaborateurs.find(meme) || (meme(s.ceo) ? s.ceo : null);
        if (!v) return null;
        s.enAttente = s.enAttente.filter(a => !meme(a));
        const pers = { id, nom: nom || v.nom, username: v.username || '', depuis: new Date().toISOString() };
        if (quoi === 'ceo') { s.ceo = pers; s.collaborateurs = s.collaborateurs.filter(x => !meme(x)); }
        else { if (meme(s.ceo)) s.ceo = null; s.collaborateurs = s.collaborateurs.filter(x => !meme(x)).concat(pers); }
        return pers;
      });
      if (!p) refus(`Personne inconnue : elle doit d'abord écrire au bot ${c.libelle}`);
      await c.envoyer(id, quoi === 'ceo' ? 'Vous êtes enregistré comme CEO : je vous préviendrai ici quand une décision vous revient.' : `Bonjour ${p.nom}, votre accès est ouvert. Écrivez-moi votre besoin (bug ou évolution) : je vous réponds ici.`).catch(() => {});
      return p;
    }
    case 'telegram.retirer': case 'slack.retirer': case 'teams.retirer': {
      const c = canaux[op.op.split('.')[0]], meme = x => x && String(x.id) === String(op.id);
      c.modifier(s => { s.collaborateurs = s.collaborateurs.filter(x => !meme(x)); s.enAttente = s.enAttente.filter(x => !meme(x)); if (meme(s.ceo)) s.ceo = null; }); return { ok: true };
    }
    case 'telegram.plafond': case 'messagerie.plafond': { const n = Number(op.n); if (!Number.isInteger(n) || n < 1 || n > 1000) refus('Plafond entre 1 et 1000 sessions par jour'); communModifier(s => { s.plafondJour = n; }); return { ok: true }; }
    // Slack (option) : app en Socket Mode, jetons du bot et de l'app
    case 'slack.jetons': sl.enregistrerJetons(op); return { ok: true };
    // Teams (option) : app Entra + compte Directeur connecté par code d'appareil ; lecture par Graph, sans adresse publique
    case 'teams.config': tm.configurer(op); return { ok: true };
    case 'teams.connexion': {
      const c = await tm.connexion(); connexionTeams = { code: c.code, url: c.url, etat: 'en_attente' };
      c.attente.then(ok => { connexionTeams = ok ? null : { ...connexionTeams, etat: 'echec' }; if (ok && tm.lire().actif) messagerie.demarrer(); });
      return { code: c.code, url: c.url };
    }
    case 'teams.deconnecter': tm.deconnecter(); connexionTeams = null; return { ok: true };
    case 'teams.activer': {
      if (op.oui && !(tm.connecte() && tm.lire().moi)) refus('Connectez d\'abord le compte Directeur');
      tm.modifier(s => { s.actif = !!op.oui; }); if (op.oui) messagerie.demarrer(); return { ok: true };
    }
    case 'slack.tester': { const r = await sl.appel('auth.test'); equipeSlack = r.team || ''; await sl.appel('apps.connections.open', {}, { app: true }); return { equipe: r.team, bot: r.user }; }
    case 'slack.activer': {
      if (op.oui && !sl.disponible()) refus('Slack demande Node 22 ou plus (WebSocket intégré)');
      if (op.oui && !(sl.jetonBot() && sl.jetonApp())) refus('Enregistrez d\'abord les deux jetons (xoxb- et xapp-)');
      sl.modifier(s => { s.actif = !!op.oui; });
      if (op.oui) messagerie.demarrer(); else messagerie.arreterSlack();
      return { ok: true };
    }
    // Moteurs d'agents (Claude Code, Codex…) et modèles : activés ou non par le CEO
    case 'moteurs.detecter': return moteurs.detecter({ forcer: true });
    case 'moteur.activer': moteurs.activerMoteur(op.nom, op.oui); return { ok: true };
    case 'modele.activer': moteurs.activerModele(op.moteur, op.id, op.oui); return { ok: true };
    case 'modele.ajouter': moteurs.ajouterModele(op.moteur, op.id); return { ok: true };
    case 'modele.retirer': moteurs.retirerModele(op.moteur, op.id); return { ok: true };
    // GitHub Copilot : connexion github.com ou GitHub Enterprise Cloud (ghe.com), jeton fin facultatif, test
    case 'copilot.connexion': copilote.configurer(op); return { commande: copilote.commandeConnexion() };
    case 'copilot.jeton': copilote.enregistrerJeton(op.jeton); return { ok: true };
    case 'copilot.oublier': copilote.oublierJeton(); return { ok: true };
    case 'copilot.tester': {
      const x = copilote.executable();
      const r = await new Promise(ok => require('child_process').execFile(x.cmd, [...x.avant, '-p', 'Réponds seulement : OK', '--silent', '--no-ask-user', '--model', 'auto'],
        { env: copilote.env(), timeout: 90e3, windowsHide: true, cwd: os.tmpdir() }, (e, out, err) => ok({ ok: !e, sortie: String(out || '').trim().slice(0, 200), erreur: String(err || (e && e.message) || '').trim().split('\n').slice(-3).join(' ').slice(0, 300) })));
      if (!r.ok) refus('Copilot ne répond pas : ' + (r.erreur || 'connexion à faire') + ` — dans un terminal : ${copilote.commandeConnexion()}`);
      return r;
    }
    case 'demande.relancer': { const x = demandes.lire().liste.find(y => y.id === op.id); if (!x || !demandes.ouverte(x)) refus('Demande close ou introuvable'); messagerie.planifier(x.id); return { ok: true }; }
    case 'backlog.importer':
    case 'notion.importer': {
      if (!['notion', 'jira'].includes(cfg.lireSource().type)) refus('Branchez Notion ou Jira d\'abord');
      const locales = cfg.sourcesLocales(), bilan = {};
      for (const c of Object.keys(COLLECTIONS)) {
        const cible = cfg.source(c), deja = new Set((await cible.lister()).map(e => e.id)); bilan[c] = 0;
        for (const e of await locales[c].lister()) if (!deja.has(e.id)) { const { notion, jira: j, ...sans } = e; await cible.creer(sans); bilan[c]++; }
      }
      return bilan;
    }
    case 'source.fichier': await cfg.ecrireSource({ ...cfg.lireSource(), type: 'fichier' }); return { ok: true };   // les réglages Notion / Jira restent
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
    const mj = /^\/api\/agents\/([^/]+)\/journal$/.exec(u.pathname);
    if (mj && req.method === 'GET') {
      const role = mj[1];
      if (!journalAgents.ROLE.test(role) || !(role === 'directeur' || (await agents.lister()).some(a => a.nom === role))) return envoyer(404, { erreur: 'Agent inconnu' });
      journalAgents.reconcilier(role);
      return envoyer(200, { ...journalAgents.lire(role, { depuis: u.searchParams.get('depuis'), nombre: u.searchParams.get('nombre') || 20 }), erreur_ecriture: journalAgents.erreurJournal() });
    }
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
      catch (e) { if (e instanceof ErreurBacklog || e instanceof exceptions.ErreurException || e instanceof integrations.ErreurIntegration || e instanceof gh.ErreurGithub || e instanceof tg.ErreurTelegram || e instanceof sl.ErreurSlack || e instanceof tm.ErreurTeams || e instanceof demandes.ErreurDemande || e instanceof moteurs.ErreurMoteur || e instanceof copilote.ErreurCopilot || e instanceof redaction.ErreurRedaction) return envoyer(400, { erreur: e.message }); throw e; }
    }
    // Instances des agents (mode autonome) : groupées par moteur et modèle, pour le Bureau
    if (u.pathname === '/api/instances' && req.method === 'GET') {
      const reg = new (require('./lib/instances').Registre)(path.join(cfg.F.prive, 'instances.json'));
      return envoyer(200, { groupes: require('./lib/instances').grouper(reg.lire()) });
    }
    if (req.method !== 'GET') return envoyer(405, { erreur: 'Méthode refusée' });
    const rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const f = path.resolve(PUBLIC, rel);
    if (!f.startsWith(PUBLIC + path.sep)) return envoyer(404, 'Introuvable', 'text/plain; charset=utf-8');
    fsp.readFile(f).then(b => envoyer(200, b, TYPES[path.extname(f)] || 'application/octet-stream'), () => envoyer(404, 'Introuvable', 'text/plain; charset=utf-8'));
  } catch (e) { console.error(e); envoyer(500, { erreur: 'Erreur interne' }); }
});

if (require.main === module) {
  serveur.listen(PORT, HOST, () => { console.log(`Le Siège : http://${HOST}:${PORT}/  (racine ${cfg.F.racine})`); redacteur.reprendre(); });
  // Journal des agents : entrées orphelines closes « interrompu », rétention appliquée au démarrage puis toutes les heures
  const entretien = () => { try { journalAgents.reconcilier(); journalAgents.purger(); } catch {} };
  entretien(); setInterval(entretien, 3600e3).unref();
  if (tg.lire().actif || sl.lire().actif || tm.lire().actif) messagerie.demarrer();
}
module.exports = { serveur, action, etat, messagerie, sujetsCeo };
