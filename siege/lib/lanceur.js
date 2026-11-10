// Mode autonome, lot 2 : lanceur d'instance d'agent. Une instance = un processus `claude -p` dans son worktree, avec une
// mission courte et une liste d'outils restreinte. L'instance ne pousse pas et ne fusionne pas : c'est le directeur
// qui décide, à partir du rapport et des fichiers modifiés.
'use strict';
const { spawn } = require('child_process');

const OUTILS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash(npm test:*)', 'Bash(node --test:*)', 'Bash(node --check:*)'];
const DUREE_MAX_MS = 20 * 60e3;

function mission(ticket) {
  return [
    `Ticket : ${ticket.id}`,
    `Étape : 4 · Développement`,
    `Titre : ${ticket.titre}`,
    '',
    'Travaille uniquement dans ce répertoire (un worktree dédié).',
    'Écris le test d\'abord, puis le changement minimal. Lance les tests avant de rendre.',
    'Ne pousse pas, ne fusionne pas, ne modifie pas le backlog.',
    'Termine par une passation de 10 lignes au maximum : fait, fichiers modifiés, reste à faire.',
  ].join('\n');
}

// Lance une instance et renvoie { ok, sortie } ; ne lève pas d'exception pour un échec de l'agent
function lancerClaude({ dossier, ticket, bin = process.env.CLAUDE_BIN || 'claude', dureeMax = DUREE_MAX_MS }) {
  return new Promise((ok, ko) => {
    let sortie = '', coupe = false;
    const p = spawn(bin, ['-p', mission(ticket), '--output-format', 'text', '--allowedTools', ...OUTILS], { cwd: dossier, stdio: ['ignore', 'pipe', 'pipe'] });
    const t = setTimeout(() => { coupe = true; p.kill('SIGTERM'); }, dureeMax);
    p.stdout.on('data', d => { sortie = (sortie + d).slice(-20000); });
    p.stderr.on('data', d => { sortie = (sortie + d).slice(-20000); });
    p.on('error', e => { clearTimeout(t); ko(e); });
    p.on('close', code => { clearTimeout(t); ok({ ok: code === 0 && !coupe, sortie: coupe ? sortie + '\n[arrêtée : durée max]' : sortie }); });
  });
}

module.exports = { lancerClaude, mission, OUTILS, DUREE_MAX_MS };
