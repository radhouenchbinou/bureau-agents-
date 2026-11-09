// Agents GitHub Copilot CLI générés depuis les mêmes sources que les agents Claude Code :
//   .claude/agents/<rôle>.md (consigne) + droits/roles.json (outils, skills)  →  .github/agents/<rôle>.agent.md
//   .claude/skills/<nom>/                                                 →  .github/skills/<nom>/
// Chaque agent Copilot porte la garde du Siège en hook PreToolUse (format compatible Claude : mêmes noms d'outils,
// code 2 = refus) ; le rôle lui est donné par SIEGE_ROLE, que pose node siege/agent.js au lancement.
// Fichiers générés : ne pas les modifier à la main (node siege/droits.js appliquer les réécrit).
'use strict';
const fs = require('fs'), path = require('path');

// Outils Claude Code → alias d'outils des agents Copilot (read, edit, search, execute, agent, web, todo)
const ALIAS = { Read: 'read', NotebookRead: 'read', Write: 'edit', Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit',
  Grep: 'search', Glob: 'search', Bash: 'execute', Agent: 'agent', Task: 'agent', WebFetch: 'web', WebSearch: 'web', TodoWrite: 'todo' };
const ENTETE = '<!-- Fichier généré par node siege/droits.js appliquer depuis .claude/agents et droits/roles.json : ne pas modifier. -->';

const yaml = s => JSON.stringify(String(s));   // chaîne YAML sûre (JSON est du YAML)
function corpsAgent(fichier) {
  const t = fs.readFileSync(fichier, 'utf8'), m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(t);
  const fm = m ? m[1] : '', description = (/^description:\s*(.+)$/m.exec(fm) || [])[1] || '';
  return { description: description.trim(), consigne: (m ? m[2] : t).trim() };
}

function agentCopilot(role, { outils, skills }, { description, consigne }) {
  const tools = [...new Set(outils.map(o => ALIAS[o]).filter(Boolean))];
  return `---
name: ${role}
description: ${yaml(description)}
tools: [${tools.map(x => `"${x}"`).join(', ')}]
hooks:
  PreToolUse:
    - type: command
      bash: 'node "$SIEGE_RACINE/siege/garde.js"'
      powershell: 'node "$env:SIEGE_RACINE\\siege\\garde.js"'
      timeoutSec: 20
---
${ENTETE}

${consigne.replace(/\bCLAUDE\.md\b/g, 'CLAUDE.md (fiche de la filiale)')}

## Skills de ton rôle

Tu disposes des skills suivantes (dossier .github/skills du Siège) ; utilise celles qui s'appliquent à ta tâche :
${skills.map(s => `- ${s}`).join('\n')}

## Règles du Siège pour un agent Copilot

- Chaque action passe par la garde du Siège : une action refusée l'est pour de bon ; si elle est nécessaire, arrête-toi et
  explique pourquoi dans ton dernier message (le directeur demandera une exception au CEO).
- Tu n'as ni accès au backlog ni jeton GitHub : ta passation (dernier message, 10 lignes au plus : Fait · Livrables ·
  Décisions · Reste · Attention) est inscrite sur le ticket par le Siège, qui pousse la branche s'il le faut.
`;
}

// Écrit .github/agents et .github/skills ; renvoie les rôles générés
function generer(racine, politique, attendu) {
  const dirA = path.join(racine, '.claude', 'agents'), outA = path.join(racine, '.github', 'agents'), outS = path.join(racine, '.github', 'skills');
  fs.mkdirSync(outA, { recursive: true });
  const faits = [];
  for (const role of Object.keys(politique.roles)) {
    if (role === 'directeur') continue;                    // le directeur reste la session principale
    const f = path.join(dirA, role + '.md'); if (!fs.existsSync(f)) continue;
    fs.writeFileSync(path.join(outA, role + '.agent.md'), agentCopilot(role, attendu(politique, role), corpsAgent(f)));
    faits.push(role);
  }
  // Agents retirés depuis : leur fichier généré disparaît aussi
  for (const x of fs.readdirSync(outA)) if (x.endsWith('.agent.md') && !faits.includes(x.slice(0, -9)) && fs.readFileSync(path.join(outA, x), 'utf8').includes(ENTETE)) fs.unlinkSync(path.join(outA, x));
  const srcS = path.join(racine, '.claude', 'skills');
  if (fs.existsSync(srcS)) { fs.rmSync(outS, { recursive: true, force: true }); fs.cpSync(srcS, outS, { recursive: true }); }
  return faits;
}

module.exports = { generer, agentCopilot, ALIAS, ENTETE };
