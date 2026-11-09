#!/usr/bin/env node
// Hook de Claude Code (.claude/settings.json) :
//   PreToolUse   → refuse (code 2 + raison sur stderr) toute action hors des droits du rôle, sauf exception active ;
//   SubagentStop → ferme les exceptions actives de l'agent qui vient de terminer sa tâche.
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
  const role = h.agent_type || 'directeur';
  try {
    const ex = require('./lib/exceptions');
    if (h.hook_event_name === 'SubagentStop') {
      for (const e of ex.terminerPourAgent(role)) journal({ evenement: 'exception_terminee', role, exception: e.id });
      return process.exit(0);
    }
    const garde = require('./lib/garde');
    let d = garde.decider(garde.charger(RACINE), { outil: h.tool_name, entree: h.tool_input || {} }, { racine: RACINE, role, exceptions: ex.actives(role) });
    if (d.ok && h.tool_name === 'Agent') d = mission(garde, h);
    if (d.ok) { if (d.exception) { ex.noterUsage(d.exception); journal({ evenement: 'exception_utilisee', role, outil: h.tool_name, exception: d.exception }); } return process.exit(0); }
    journal({ evenement: 'refus', role, outil: h.tool_name, raison: d.raison, type: d.type || '', motif: d.motif || '' });
    bloquer(`Refusé par la garde du Siège — ${d.raison}.` + (d.type
      ? ` Si cette action est indispensable à ta tâche, arrête-toi et demande une exception au directeur : type « ${d.type} », motif « ${String(d.motif).slice(0, 200)} », avec ta justification. Ne cherche pas de contournement.`
      : ' Cette limite ne fait pas l\'objet d\'exception.'));
  } catch (e) { journal({ evenement: 'erreur_garde', role, erreur: String(e.message) }); bloquer('Garde : erreur interne (' + e.message + '), action refusée.'); }
});
