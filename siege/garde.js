#!/usr/bin/env node
// Hook de Claude Code (.claude/settings.json) :
//   PreToolUse   → refuse (code 2 + raison sur stderr) toute action hors des droits du rôle, sauf exception active ;
//   SubagentStop → ferme les exceptions actives de l'agent qui vient de terminer sa tâche.
// Chaque refus et chaque usage d'exception est journalisé dans ~/.siege/journal-garde.jsonl (lu par le Siège).
// En cas d'erreur interne, la garde REFUSE (jamais d'ouverture par défaut).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const RACINE = path.resolve(__dirname, '..');

const { journal, refusIdentite } = require('./lib/journal');
// Liaison session du directeur → (ticket, étape), gardée 7 jours dans ~/.siege/sessions-etapes.json
// Modèle d'un sous-agent Claude Code (paramètre de l'appel, sinon celui de sa définition) : activé par le CEO ?
function modeleAutorise(h) {
  const moteurs = require('./lib/moteurs'), e = h.tool_input || {};
  let m = e.model || '';
  if (!m && e.subagent_type) { try { m = (/^model:\s*(\S+)/m.exec(fs.readFileSync(path.join(RACINE, '.claude', 'agents', e.subagent_type + '.md'), 'utf8').split(/^---$/m)[1] || '') || [])[1] || ''; } catch {} }
  const r = moteurs.autorise('claude', m);
  return r.ok ? null : { ok: false, raison: r.raison + ' : choisis un autre modèle (paramètre model) ou demande au CEO de le réactiver' };
}
function mission(garde, h) {
  const d = process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege'), f = path.join(d, 'sessions-etapes.json');
  let l = {}; try { l = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  const r = garde.verifierMission(l, h.session_id, h.tool_input || {});
  if (r.ok && r.lier) {
    const limite = Date.now() - 7 * 864e5;
    for (const [k, v] of Object.entries(l)) if (Date.parse(v.date) < limite) delete l[k];
    l[h.session_id] = r.lier;
    fs.mkdirSync(d, { recursive: true, mode: 0o700 }); const t = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(t, JSON.stringify(l, null, 1), { mode: 0o600 }); fs.renameSync(t, f);
  }
  return r;
}
function bloquer(message) { process.stderr.write(message + '\n'); process.exit(2); }

let brut = '';
process.stdin.on('data', d => { brut += d; });
process.stdin.on('end', () => {
  let h; try { h = JSON.parse(brut); } catch { return bloquer('Garde : entrée illisible, action refusée.'); }
  // Rôle : celui du sous-agent ; sinon, pour un agent Copilot lancé par node siege/agent.js, SIEGE_ROLE (posé par l'outil,
  // hors de portée de l'agent) ; sinon le directeur
  const role = h.agent_type || process.env.SIEGE_ROLE || 'directeur';
  try {
    const ex = require('./lib/exceptions');
    if (h.hook_event_name === 'SubagentStop') {
      for (const e of ex.terminerPourAgent(role)) journal({ evenement: 'exception_terminee', role, exception: e.id });
      return process.exit(0);
    }
    const garde = require('./lib/garde');
    let d = garde.decider(garde.charger(RACINE), { outil: h.tool_name === 'Task' ? 'Agent' : h.tool_name, entree: h.tool_input || {} }, { racine: RACINE, role, exceptions: ex.actives(role) });
    const n = garde.normaliser(h.tool_name === 'Task' ? 'Agent' : h.tool_name, h.tool_input || {}), hn = { ...h, tool_name: n.outil, tool_input: n.entree };
    if (d.ok && hn.tool_name === 'Agent') d = modeleAutorise(hn) || mission(garde, hn);
    // Un agent d'un autre moteur (node siege/agent.js lancer) suit la même règle : une session = une étape d'un ticket
    if (d.ok && hn.tool_name === 'Bash') {
      const c = String((hn.tool_input || {}).command || '');
      if (/^\s*node siege\/agent\.js lancer\b/.test(c)) {
        const v = (k) => { const m = new RegExp('--' + k + '\\s+("([^"]*)"|\'([^\']*)\'|(\\S+))').exec(c); return m ? (m[2] ?? m[3] ?? m[4]) : ''; };
        d = mission(garde, { ...h, tool_input: { prompt: `Ticket : ${v('ticket')}\nÉtape : ${v('etape')}` } });
      }
    }
    // Identité imposée (EIA-001) : un segment « node siege/<outil>.js » autorisé dépose l'entrée que l'outil consommera
    if (d.ok && hn.tool_name === 'Bash') {
      const identite = require('./lib/identite');
      for (const mots of garde.outilsSiege((hn.tool_input || {}).command)) {
        const m = identite.deposer(role, mots); if (m) { d = { ok: false, raison: m }; break; }
      }
    }
    if (!d.ok && d.refusIdentite) refusIdentite({ role, ...d.refusIdentite });
    if (d.ok) { if (d.exception) { ex.noterUsage(d.exception); journal({ evenement: 'exception_utilisee', role, outil: h.tool_name, exception: d.exception }); } return process.exit(0); }
    journal({ evenement: 'refus', role, outil: h.tool_name, raison: d.raison, type: d.type || '', motif: d.motif || '' });
    bloquer(`Refusé par la garde du Siège — ${d.raison}.` + (d.type
      ? ` Si cette action est indispensable à ta tâche, arrête-toi et demande une exception au directeur : type « ${d.type} », motif « ${String(d.motif).slice(0, 200)} », avec ta justification. Ne cherche pas de contournement.`
      : ' Cette limite ne fait pas l\'objet d\'exception.'));
  } catch (e) { journal({ evenement: 'erreur_garde', role, erreur: String(e.message) }); bloquer('Garde : erreur interne (' + e.message + '), action refusée.'); }
});
