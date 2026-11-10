#!/usr/bin/env node
// Hook de Claude Code (.claude/settings.json) :
//   PreToolUse   → refuse (code 2 + raison sur stderr) toute action hors des droits du rôle, sauf exception active ;
//   SubagentStop → ferme les exceptions actives de l'agent qui vient de terminer sa tâche ;
//   UserPromptSubmit → « t'es une session maintainer » tapé par le CEO désigne la session mainteneur.
// Chaque refus et chaque usage d'exception est journalisé dans ~/.siege/journal-garde.jsonl (lu par le Siège).
// En cas d'erreur interne, la garde REFUSE (jamais d'ouverture par défaut).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const RACINE = path.resolve(__dirname, '..');

function journal(ligne) {
  try {
    const d = process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege'); fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    fs.appendFileSync(path.join(d, 'journal-garde.jsonl'), JSON.stringify({ date: new Date().toISOString(), ...ligne }) + '\n', { mode: 0o600 });
  } catch {}
}
// Liaison session du directeur → (ticket, étape), gardée 7 jours dans ~/.siege/sessions-etapes.json
// Modèle d'un sous-agent Claude Code (paramètre de l'appel, sinon celui de sa définition) : activé par le CEO ?
function modeleAutorise(h) {
  const moteurs = require('./lib/moteurs'), e = h.tool_input || {};
  let m = e.model || '';
  if (!m && e.subagent_type) { try { m = (/^model:\s*(\S+)/m.exec(fs.readFileSync(path.join(RACINE, '.claude', 'agents', e.subagent_type + '.md'), 'utf8').split(/^---$/m)[1] || '') || [])[1] || ''; } catch {} }
  const r = moteurs.autorise('claude', m);
  return r.ok ? null : { ok: false, raison: r.raison + ' : choisis un autre modèle (paramètre model) ou demande au CEO de le réactiver' };
}
// Étape désactivée par le CEO pour ce ticket : lue par la CLI du backlog (Notion ou fichiers). Illisible = désactivée (refus).
function etapeDesactiveeCEO(ticket, etape) {
  const r = require('child_process').spawnSync('node', [path.join(RACINE, 'siege', 'backlog.js'), 'etapes', ticket], { encoding: 'utf8', timeout: 20e3, cwd: RACINE });
  if (r.status !== 0) return true;
  try { return JSON.parse(r.stdout).etapes_desactivees.includes(etape); } catch { return true; }
}
function mission(garde, h) {
  const d = process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege'), f = path.join(d, 'sessions-etapes.json');
  let l = {}; try { l = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  const r = garde.verifierMission(l, h.session_id, h.tool_input || {}, etapeDesactiveeCEO);
  if (r.ok && r.lier) {
    const limite = Date.now() - 7 * 864e5;
    for (const [k, v] of Object.entries(l)) if (Date.parse(v.date) < limite) delete l[k];
    l[h.session_id] = r.lier;
    fs.mkdirSync(d, { recursive: true, mode: 0o700 }); const t = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(t, JSON.stringify(l, null, 1), { mode: 0o600 }); fs.renameSync(t, f);
  }
  return r;
}
// Sessions désignées mainteneur par le CEO en tapant « t'es une session maintainer » dans Claude Code
// (~/.siege/sessions-mainteneur.json, hors de portée des agents). Seul un message tapé par l'utilisateur, en entier,
// dans une session interactive du Siège désigne la session ; jamais un sous-agent ni une session lancée par le Siège.
const PHRASE_MAINTENEUR = /^\s*(t['’]?\s?es|tu es)\s+(une\s+)?session\s+(maintainer|mainteneur)\s*[.!]*\s*$/i;
function fichierMainteneurs() { return path.join(process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege'), 'sessions-mainteneur.json'); }
function sessionsMainteneur() { try { return JSON.parse(fs.readFileSync(fichierMainteneurs(), 'utf8')); } catch { return {}; } }
function designerMainteneur(id) {
  const l = sessionsMainteneur(), limite = Date.now() - 30 * 864e5;
  for (const [k, v] of Object.entries(l)) if (Date.parse(v) < limite) delete l[k];
  l[id] = new Date().toISOString();
  const f = fichierMainteneurs(); fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
  const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(l, null, 1), { mode: 0o600 }); fs.renameSync(t, f);
}
function bloquer(message) { process.stderr.write(message + '\n'); process.exit(2); }

let brut = '';
process.stdin.on('data', d => { brut += d; });
process.stdin.on('end', () => {
  let h; try { h = JSON.parse(brut); } catch { return bloquer('Garde : entrée illisible, action refusée.'); }
  // Rôle : celui du sous-agent ; sinon, pour un agent Copilot lancé par node siege/agent.js, SIEGE_ROLE (posé par l'outil,
  // hors de portée de l'agent) ; sinon le directeur
  // « mainteneur » ne vient que de siege/mainteneur.sh (environnement) : un sous-agent qui porterait ce nom n'en a aucun droit
  if (h.hook_event_name === 'UserPromptSubmit') {
    if (!h.agent_type && !process.env.SIEGE_SESSION_AUTO && h.session_id && PHRASE_MAINTENEUR.test(String(h.prompt || ''))) {
      try { designerMainteneur(h.session_id); } catch (e) { return bloquer('Garde : impossible de désigner la session mainteneur (' + e.message + ').'); }
      journal({ evenement: 'session_mainteneur_designee', role: 'CEO', session: h.session_id });
      let regle = ''; try { regle = fs.readFileSync(path.join(RACINE, 'process', 'mainteneur.md'), 'utf8'); } catch {}
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext:
        'Le CEO vient de désigner cette session comme session mainteneur. La garde du Siège ne la restreint plus. Applique désormais cette règle à la place de CLAUDE.md :\n\n' + regle } }));
    }
    return process.exit(0);
  }
  const mainteneur = !h.agent_type && (process.env.SIEGE_ROLE === 'mainteneur' || (h.session_id && h.session_id in sessionsMainteneur()));
  const role = h.agent_type ? (h.agent_type === 'mainteneur' ? 'sous-agent-mainteneur-refuse' : h.agent_type) : (mainteneur ? 'mainteneur' : (process.env.SIEGE_ROLE || 'directeur'));
  // Session mainteneur : aucune demande de permission non plus
  if (role === 'mainteneur' && h.hook_event_name === 'PreToolUse') {
    journal({ evenement: 'action_mainteneur', role, outil: h.tool_name, detail: String((h.tool_input || {}).command || (h.tool_input || {}).file_path || '').slice(0, 300) });
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'Session mainteneur' } }));
    return process.exit(0);
  }
  try {
    const ex = require('./lib/exceptions');
    if (h.hook_event_name === 'SubagentStop') {
      for (const e of ex.terminerPourAgent(role)) journal({ evenement: 'exception_terminee', role, exception: e.id });
      return process.exit(0);
    }
    const garde = require('./lib/garde');
    let d = garde.decider(garde.charger(RACINE), { outil: h.tool_name === 'Task' ? 'Agent' : h.tool_name, entree: h.tool_input || {} }, { racine: RACINE, role, exceptions: ex.actives(role) });
    const n = garde.normaliser(h.tool_name === 'Task' ? 'Agent' : h.tool_name, h.tool_input || {}), hn = { ...h, tool_name: n.outil, tool_input: n.entree };
    if (d.libre) {
      const e = hn.tool_input || {}, quoi = String(e.command || e.file_path || e.url || e.subagent_type || '').slice(0, 300);
      journal({ evenement: 'action_sans_restriction', role, outil: hn.tool_name, detail: quoi });
      return process.exit(0);
    }
    if (d.ok && hn.tool_name === 'Agent') d = modeleAutorise(hn) || mission(garde, hn);
    // Un agent d'un autre moteur (node siege/agent.js lancer) suit la même règle : une session = une étape d'un ticket
    if (d.ok && hn.tool_name === 'Bash') {
      const c = String((hn.tool_input || {}).command || '');
      if (/^\s*node siege\/agent\.js lancer\b/.test(c)) {
        const v = (k) => { const m = new RegExp('--' + k + '\\s+("([^"]*)"|\'([^\']*)\'|(\\S+))').exec(c); return m ? (m[2] ?? m[3] ?? m[4]) : ''; };
        d = mission(garde, { ...h, tool_input: { prompt: `Ticket : ${v('ticket')}\nÉtape : ${v('etape')}` } });
      }
    }
    if (d.ok) { if (d.exception) { ex.noterUsage(d.exception); journal({ evenement: 'exception_utilisee', role, outil: h.tool_name, exception: d.exception }); } return process.exit(0); }
    journal({ evenement: 'refus', role, outil: h.tool_name, raison: d.raison, type: d.type || '', motif: d.motif || '' });
    bloquer(`Refusé par la garde du Siège — ${d.raison}.` + (d.type
      ? ` Si cette action est indispensable à ta tâche, arrête-toi et demande une exception au directeur : type « ${d.type} », motif « ${String(d.motif).slice(0, 200)} », avec ta justification. Ne cherche pas de contournement.`
      : ' Cette limite ne fait pas l\'objet d\'exception.'));
  } catch (e) { journal({ evenement: 'erreur_garde', role, erreur: String(e.message) }); bloquer('Garde : erreur interne (' + e.message + '), action refusée.'); }
});
