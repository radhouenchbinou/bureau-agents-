// La garde : décide, avant chaque action d'un agent, si son rôle l'autorise (droits/roles.json),
// sinon si une exception accordée par le CEO et activée par le directeur la couvre. Tout le reste est refusé.
// Appelée par le hook PreToolUse de .claude/settings.json (voir siege/garde.js), qui reçoit agent_type :
// absent = session principale = directeur.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const identite = require('./identite'), { options, ErreurOptions } = require('./options');

const OUTILS_LECTURE = ['Read', 'Grep', 'Glob', 'NotebookRead'];
const OUTILS_ECRITURE = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
const OUTILS_WEB = ['WebFetch', 'WebSearch'];
const ENV_INTERDITES = /^(PATH|LD_\w+|DYLD_\w+|NODE_OPTIONS|NODE_PATH|PYTHONPATH|PYTHONSTARTUP|GIT_\w+|BASH_ENV|ENV|HOME|SHELL|IFS|PS4|PROMPT_COMMAND|CLAUDECODE|SIEGE_\w+|CLAUDE_\w+)$/;   // SIEGE_*, CLAUDE* : contexte d'identité (EIA-001), hors de portée des agents

// ---------- Découpage d'une commande shell (sans l'exécuter) ----------
// Renvoie { segments: [{ mots, tube }], refus } ; refuse substitutions, redirections et fonds de tâche.
function decouper(cmd) {
  const segs = []; let mots = [], mot = null, q = null, tube = false, joker = false;
  const fin = () => { if (mot !== null) { mots.push(mot); mot = null; } };
  const coupe = estTube => { fin(); if (!mots.length) return 'Commande vide autour d\'un séparateur'; segs.push({ mots, tube, joker }); mots = []; tube = estTube; joker = false; return null; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i], n = cmd[i + 1];
    if (q === "'") { if (c === "'") q = null; else mot += c; continue; }
    if (q === '"') {
      if (c === '"') { q = null; continue; }
      if (c === '`' || (c === '$' && (n === '(' || n === '{'))) return { refus: 'Substitution de commande interdite' };
      if (c === '\\' && n === '\n') { i++; continue; }
      if (c === '\\' && (n === '$' || n === '`' || n === '"' || n === '\\')) { mot += n; i++; continue; }   // sinon l'antislash reste : même mots que l'outil lancé
      mot += c; continue;
    }
    if (c === "'" || c === '"') { q = c; if (mot === null) mot = ''; continue; }
    if (c === '\\') { if (n === '\n') { i++; continue; } mot = (mot || '') + (n || ''); i++; continue; }
    if (c === '`' || (c === '$' && (n === '(' || n === '{'))) return { refus: 'Substitution de commande interdite' };
    if (c === '\n' || c === ';') { const e = coupe(false); if (e) return { refus: e }; continue; }
    if (c === '&' && n === '&') { const e = coupe(false); if (e) return { refus: e }; i++; continue; }
    if (c === '|' && n === '|') { const e = coupe(false); if (e) return { refus: e }; i++; continue; }
    if (c === '|') { const e = coupe(true); if (e) return { refus: e }; continue; }
    if (c === '2' && n === '>' && cmd[i + 2] === '&' && cmd[i + 3] === '1' && mot === null) { i += 3; continue; }   // 2>&1 seul toléré
    if (c === '&') return { refus: 'Exécution en arrière-plan interdite' };
    if (c === '>' || c === '<') return { refus: 'Redirection interdite : utilisez les outils d\'écriture' };
    if (/\s/.test(c)) { fin(); continue; }
    if (c === '*' || c === '?' || c === '[' || (c === '~' && mot === null && n !== undefined && n !== '/' && !/\s/.test(n))) joker = true;   // développés par le shell
    mot = (mot || '') + c;
  }
  if (q) return { refus: 'Guillemet non fermé' };
  fin(); if (mots.length) segs.push({ mots, tube, joker }); else if (segs.length) return { refus: 'Commande vide en fin de ligne' };
  return { segments: segs };
}

// ---------- Chemins ----------
function globVersRegex(g) {
  let r = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { if (g[i + 2] === '/') { r += '(?:.*/)?'; i += 2; } else { r += '.*'; i++; } }
    else if (c === '*') r += '[^/]*';
    else if (c === '?') r += '[^/]';
    else r += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + r + '$');
}
// Un motif commençant par ~/ vise le dossier personnel ; sinon il est relatif à la racine du Siège ; **/ partout
function correspond(absolu, motif, racine) {
  const maison = os.homedir();
  if (motif.startsWith('~/')) return globVersRegex(path.join(maison, motif.slice(2)).split(path.sep).join('/')).test(absolu.split(path.sep).join('/'));
  const rel = path.relative(racine, absolu).split(path.sep).join('/');
  if (motif.startsWith('**/')) return globVersRegex(motif).test(rel) || globVersRegex(motif.slice(3)).test(path.basename(absolu));
  if (rel.startsWith('..')) return false;
  return globVersRegex(motif).test(rel);
}
const reel = p => { try { return fs.realpathSync(p); } catch { const d = path.dirname(p); return d === p ? p : path.join(reel(d), path.basename(p)); } };

// ---------- Commandes de lecture et de fichiers (tous les rôles) ----------
// Lecture : permises à tous, sauf options qui écrivent ou exécutent, et jamais sur un secret (lecture_interdite).
// Fichiers (mkdir, cp, mv, rm…) : permises là où le rôle peut écrire (mêmes règles que l'outil Write).
const OPTIONS_INTERDITES = {
  find: /^-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/,
  sort: /^(-o.*|--output(=.*)?)$/,
  tree: /^-o$/,
  rg: /^--pre(=.*)?$/
};
const CMD_FICHIERS = new Set(['mkdir', 'touch', 'cp', 'mv', 'rm', 'rmdir', 'chmod', 'ln']);
const estChemin = m => !m.startsWith('-') && (/[\/~.]/.test(m) || fs.existsSync(m));
const absolu = (racine, m, cwd) => reel(m === '~' ? os.homedir() : m.startsWith('~/') ? path.join(os.homedir(), m.slice(2)) : path.resolve(cwd || racine, m));
function verifierLecture(R, racine, mots, cwd) {
  const opt = OPTIONS_INTERDITES[mots[0]];
  for (const m of mots.slice(1)) {
    if (opt && opt.test(m)) return `Option interdite pour ${mots[0]} : ${m} (lecture seule)`;
    if (!estChemin(m)) continue;
    const abs = absolu(racine, m, cwd);
    if (R.lectureInterdite.some(x => correspond(abs, x, racine))) return `Lecture interdite (secret ou identifiant) : ${m}`;
  }
  return null;
}
function verifierFichiers(R, racine, mots, cwd) {
  const cmd = mots[0], args = mots.slice(1).filter(m => !m.startsWith('-'));
  if (!args.length) return `${cmd} sans chemin`;
  const recursif = mots.slice(1).some(m => /^-[a-zA-Z]*[rR]/.test(m) || m === '--recursive');
  // cp et ln : les sources sont lues, la destination écrite ; mv : sources et destination changent
  const ecrits = cmd === 'cp' || cmd === 'ln' ? args.slice(-1) : args, lus = cmd === 'cp' || cmd === 'ln' ? args.slice(0, -1) : [];
  for (const m of lus) { const abs = absolu(racine, m, cwd); if (R.lectureInterdite.some(x => correspond(abs, x, racine))) return `Lecture interdite (secret ou identifiant) : ${m}`; }
  for (const m of ecrits) {
    const abs = absolu(racine, m, cwd), rel = path.relative(racine, abs);
    if (R.ecritureInterdite.some(x => correspond(abs, x, racine))) return `Écriture interdite à tous les agents : ${rel} (zone protégée)`;
    if (!R.ecriture.some(x => correspond(abs, x, racine) || correspond(path.join(abs, '_'), x, racine))) return `${R.role} n'écrit pas dans ${rel} (autorisé : ${R.ecriture.join(', ') || 'rien'})`;
    if ((cmd === 'rm' || cmd === 'rmdir' || cmd === 'mv') && fs.existsSync(path.join(abs, '.git'))) return `${cmd} d'un dépôt git entier interdit : ${rel}`;
    if (cmd === 'rm' && recursif && (rel === '' || rel === 'projets')) return 'Suppression récursive de la racine ou de projets/ interdite';
  }
  return null;
}

// ---------- Politique ----------
// Politique = droits/roles.json + règles permanentes accordées par le CEO (droits/autorisations.json)
function charger(racine) {
  const p = JSON.parse(fs.readFileSync(path.join(racine, 'droits', 'roles.json'), 'utf8'));
  const enPlus = require('./parametres').reglesEnPlus(racine);
  for (const [role, regs] of Object.entries(enPlus)) if (p.roles[role]) p.roles[role].bash = [...p.roles[role].bash, ...regs];
  return p;
}
function regles(politique, role) {
  const r = politique.roles[role]; if (!r) return null;
  const c = politique.commun;
  const remplace = s => s.split('{role}').join(role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return {
    role, outils: new Set([...c.outils_toujours, ...r.outils]),
    lectureInterdite: c.lecture_interdite, ecritureInterdite: c.ecriture_interdite, ecriture: r.ecriture,
    bash: [...c.bash, ...r.bash].map(s => new RegExp(remplace(s))), tubes: new Set(c.tubes), web: r.web || [],
    lecture: new Set(c.lecture_shell || [])
  };
}

// ---------- Décision ----------
// action = { outil, entree } ; contexte = { racine, role, exceptions: [actives pour ce rôle] }
// Renvoie { ok: true } ou { ok: false, raison, type, motif } (type/motif = de quoi faire une demande d'exception)
// Copilot CLI (format compatible Claude) : shell Windows « powershell », chemins sous « path », barres obliques inversées
function normaliser(outil, entree) {
  if (/^(powershell|pwsh|shell|bash)$/i.test(outil)) outil = 'Bash';
  if (outil === 'Bash' && typeof entree.command === 'string') entree = { ...entree, command: entree.command.replace(/\bsiege\\([a-z-]+\.js)\b/g, 'siege/$1') };
  if (!entree.file_path && typeof entree.path === 'string' && ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(outil)) entree = { ...entree, file_path: entree.path };
  if (outil === 'Agent') entree = { ...entree, subagent_type: entree.subagent_type || entree.agent_type || entree.agent || '', prompt: entree.prompt || entree.task || entree.description || '' };
  return { outil, entree };
}
// Défense en profondeur sur les outils du Siège (l'outil reste l'autorité) : option répétée, --auteur (commenter) ou
// --role (github) différent du rôle. Renvoie un refus { ok: false, raison, refusIdentite? } ou null.
function controleOutil(politique, role, mots) {
  const m = /^siege\/(\w+)\.js$/.exec(mots[0] === 'node' ? mots[1] || '' : ''); if (!m || !identite.OUTILS.includes(m[1])) return null;
  let o; try { o = options(mots.slice(2)).o; } catch (e) { if (e instanceof ErreurOptions) return { ok: false, raison: e.message }; throw e; }
  const outil = m[1], sous = mots[2] || '', valeur = outil === 'backlog' && sous === 'commenter' ? o.auteur : outil === 'github' ? o.role : undefined;
  const raison = identite.refusDemande(politique, role, valeur);
  return raison ? { ok: false, raison, refusIdentite: { demande: valeur, outil, sous_commande: sous } } : null;
}
// Segments « node siege/<outil>.js … » d'une commande déjà autorisée : mots à enregistrer dans le registre d'identité
function outilsSiege(commande) {
  const d = decouper(String(commande || '')), out = []; if (d.refus) return out;
  for (const s of d.segments) {
    if (s.tube) continue;
    const mots = [...s.mots]; while (mots.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(mots[0])) mots.shift();
    if (mots[0] === 'node' && /^siege\/\w+\.js$/.test(mots[1] || '') && identite.OUTILS.includes(mots[1].slice(6, -3))) out.push(mots.slice(1));
  }
  return out;
}
function decider(politique, brut, { racine, role, exceptions = [] }) {
  // Mode sans restriction décidé par le CEO (Siège › Admin) : tout passe, la garde ne fait que journaliser
  if (require('./mode-libre').actif(racine)) return { ok: true, libre: true };
  // Session du mainteneur (siege/mainteneur.sh, rôle fixé par l'environnement de lancement, jamais par un sous-agent)
  if (role === 'mainteneur') return { ok: true, libre: true };
  const { outil, entree = {} } = normaliser(brut.outil, brut.entree || {});
  const R = regles(politique, role);
  if (!R) return { ok: false, raison: `Rôle inconnu de droits/roles.json : ${role}` };
  const exc = (type, ok) => exceptions.find(e => e.type === type && ok(e.motif));
  const refus = (raison, type, motif) => {
    const e = type && exc(type, m => type === 'bash' ? motif.startsWith(m) : type === 'web' ? motif === m || motif.endsWith('.' + m) : correspond(motif, m, racine));
    return e ? { ok: true, exception: e.id } : { ok: false, raison, type, motif };
  };

  // Contexte propre : on ne prolonge jamais le contexte d'un agent, on ne lui transmet jamais celui du directeur
  if (outil === 'SendMessage') return { ok: false, raison: 'Contexte propre : un agent qui a fini sa tâche ne la reprend pas. Lance un nouvel agent avec le chemin du livrable et la remarque' };
  if (outil === 'Agent' && entree.subagent_type === 'fork') return { ok: false, raison: 'Contexte propre : pas de « fork » (il hériterait de tout le contexte du directeur). Lance l\'agent du rôle avec une mission courte' };
  if (outil.startsWith('mcp__')) return refus(`Outil externe ${outil} non autorisé pour ${role}`, 'outil', outil);
  if (!R.outils.has(outil) && !OUTILS_WEB.includes(outil)) return refus(`L'outil ${outil} n'est pas autorisé pour ${role}`, 'outil', outil);

  if (OUTILS_LECTURE.includes(outil)) {
    const p = entree.file_path || entree.notebook_path || entree.path; if (!p) return { ok: true };
    const abs = reel(path.resolve(racine, p));
    if (R.lectureInterdite.some(m => correspond(abs, m, racine))) return refus(`Lecture interdite (secret ou identifiant) : ${p}`, 'lecture', abs);
    return { ok: true };
  }
  if (OUTILS_ECRITURE.includes(outil)) {
    const p = entree.file_path || entree.notebook_path; if (!p) return { ok: false, raison: 'Chemin manquant' };
    const abs = reel(path.resolve(racine, p));
    if (R.ecritureInterdite.some(m => correspond(abs, m, racine))) return { ok: false, raison: `Écriture interdite à tous les agents : ${path.relative(racine, abs)} (zone protégée : droits, Siège, backlog, secrets)` };
    if (!R.ecriture.some(m => correspond(abs, m, racine))) return refus(`${role} n'écrit pas dans ${path.relative(racine, abs)} (autorisé : ${R.ecriture.join(', ') || 'rien'})`, 'ecriture', abs);
    return { ok: true };
  }
  if (OUTILS_WEB.includes(outil)) {
    let hote = ''; try { hote = new URL(entree.url || '').hostname; } catch {}
    if (outil === 'WebFetch' && hote && R.web.some(d => hote === d || hote.endsWith('.' + d))) return { ok: true };
    return refus(`Accès web refusé à ${role}${hote ? ' : ' + hote : ''} (seuls GitHub et Notion, via les outils du Siège)`, 'web', hote || outil);
  }
  if (outil === 'Bash') {
    const d = decouper(String(entree.command || ''));
    if (d.refus) return { ok: false, raison: d.refus };
    let cwd = racine;
    for (const s of d.segments) {
      const mots = [...s.mots];
      while (mots.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(mots[0])) {
        const nom = mots[0].split('=')[0]; if (ENV_INTERDITES.test(nom)) return { ok: false, raison: `Variable d'environnement interdite : ${nom}` }; mots.shift();
      }
      if (!mots.length) continue;
      if (mots.some(m => /(^|\/)\.\.(\/|$)/.test(m))) return { ok: false, raison: 'Chemin avec « .. » interdit dans une commande' };
      if (s.tube) {
        if (!R.tubes.has(mots[0]) && !(R.lecture.has(mots[0]) && mots[0] !== 'find')) return { ok: false, raison: `Après un tube, seules les commandes de lecture sont permises (${[...R.tubes].join(', ')}…)` };
        const e = verifierLecture(R, racine, mots, cwd); if (e) return { ok: false, raison: e };
        continue;
      }
      if (mots[0] === 'cd') {
        const abs = reel(path.resolve(cwd || racine, mots[1] || '.')), rel = path.relative(racine, abs);
        if (rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, raison: 'cd hors du Siège interdit' };
        cwd = abs; continue;
      }
      const texte = mots.join(' ');
      const id = controleOutil(politique, role, mots); if (id) return id;
      if (/^node siege\/exception\.js (accorder|refuser)\b/.test(texte)) return { ok: false, raison: 'Seul le CEO accorde ou refuse une exception (Siège › Exceptions)' };
      if (R.lecture.has(mots[0]) || CMD_FICHIERS.has(mots[0])) {
        if (s.joker) return refus(`Joker non entre guillemets dans « ${texte.slice(0, 80)} » : utilisez l'outil Glob, ou mettez le motif entre guillemets pour find et grep`, 'bash', texte);
        const e = R.lecture.has(mots[0]) ? verifierLecture(R, racine, mots, cwd) : verifierFichiers(R, racine, mots, cwd);
        if (e) return refus(e, 'bash', texte);
        continue;
      }
      // Code en ligne d'un interpréteur : refusé (le code exécuté doit être un fichier relu et versionné).
      // « python -m module » lance un module installé ou versionné (pip, pytest…), ses options ne sont pas du code en ligne.
      if (/^(python3?|node|ruby|perl|php|bash|sh|zsh|deno|bun)$/.test(mots[0]) && mots[1] !== '-m' && mots.slice(1).some(m => /^(-c|-e|-p|--eval|--print|-r|--require|--import)$/.test(m)))
        return refus(`Code en ligne interdit (${mots[0]} ${mots.find(m => /^-/.test(m))}) : écrivez un fichier`, 'bash', texte);
      // Les outils du Siège (siege/*.js) ne passent que par les règles qui les nomment, jamais par « node … » générique
      const touche = mots.slice(1).some(m => !m.startsWith('-') && path.relative(path.join(racine, 'siege'), absolu(racine, m, cwd)).split(path.sep)[0] !== '..' && !path.isAbsolute(path.relative(path.join(racine, 'siege'), absolu(racine, m, cwd))));
      const regles = touche ? R.bash.filter(re => /siege/.test(re.source)) : R.bash;
      if (!regles.some(re => re.test(texte))) return refus(`Commande non autorisée pour ${role} : ${texte.slice(0, 160)}`, 'bash', texte);
    }
    return { ok: true };
  }
  return { ok: true };   // outil autorisé sans paramètre sensible (Skill, TodoWrite, Agent pour le directeur…)
}

// ---------- Contexte propre : une session du directeur = une étape d'un ticket ----------
// liaisons = { <session_id>: { ticket, etape, date } }. La mission d'un agent porte « Ticket : <ID> » et « Étape : <n> ».
// Renvoie { ok, raison?, lier? } ; lier = la liaison à enregistrer pour cette session.
const RE_TICKET = /^\s*Ticket\s*:\s*([A-Z]{3}-\d{3})\b/mi, RE_ETAPE = /^\s*[ÉE]tape\s*:\s*(\d+)\b/mi;
// desactivee(ticket, etape) → true si le CEO a désactivé cette étape pour ce ticket (fourni par siege/garde.js)
function verifierMission(liaisons, session, entree, desactivee) {
  const texte = String(entree.prompt || ''), t = texte.match(RE_TICKET);
  if (!t) return { ok: true };                    // mission hors ticket (standup, audit) : pas de liaison
  const e = texte.match(RE_ETAPE);
  if (!e) return { ok: false, raison: 'Mission sans « Étape : <n> » : ajoute le numéro d\'étape du circuit en tête de mission' };
  const ticket = t[1].toUpperCase(), etape = Number(e[1]), deja = session && liaisons[session];
  if (desactivee && desactivee(ticket, etape)) return { ok: false, raison: `L'étape ${etape} est désactivée pour ${ticket} (décision du CEO dans le Siège) : passe à l'étape suivante active` };
  if (deja && (deja.ticket !== ticket || deja.etape !== etape))
    return { ok: false, raison: `Contexte propre : cette session a servi à ${deja.ticket} étape ${deja.etape}. Enregistre la passation et le passage à l'étape suivante dans le ticket, puis termine ton tour ; l'étape ${etape} de ${ticket} se fait dans une nouvelle session (/clear puis /feature ${ticket}, ou « Lancer » dans le Siège)` };
  return { ok: true, lier: session && !deja ? { ticket, etape, date: new Date().toISOString() } : null };
}

module.exports = { normaliser, verifierMission, decouper, globVersRegex, correspond, charger, regles, decider, outilsSiege, cleIdentite: identite.cleIdentite };
