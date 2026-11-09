// Génère .claude/settings.json (garde, bac à sable, réseau) à partir de :
//   - la base fixe ci-dessous : seul accès extérieur = GitHub et Notion ;
//   - droits/autorisations.json : autorisations permanentes ajoutées ou retirées par le CEO dans le Siège.
// Aucun agent ne peut écrire ces fichiers (garde + bac à sable) : seul le serveur du Siège, piloté par le CEO.
'use strict';
const fs = require('fs'), path = require('path');
const { ErreurBacklog } = require('./backlog');

const DOMAINES_BASE = ['github.com', 'api.github.com', 'codeload.github.com', '*.githubusercontent.com', 'api.notion.com'];
// Hôte GitHub de l'entreprise (github.com par défaut, ou GitHub Enterprise : portfolio/github.json › url)
function domainesGithub(racine) {
  try { const u = JSON.parse(fs.readFileSync(path.join(racine, 'portfolio', 'github.json'), 'utf8')).url; return require('./github').hote(u).domaines; } catch { return []; }
}
const OUTILS_SIEGE = ['node siege/backlog.js *', 'node siege/github.js *', 'node siege/exception.js *', 'node siege/demande.js *', 'node siege/filiale.js *', 'node siege/agent.js *'];   // lisent les secrets : hors bac à sable, filtrés par la garde
const TYPES = {
  domaine: { libelle: 'Domaine réseau autorisé', motif: /^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$/i },
  commande: { libelle: 'Commande exécutée hors bac à sable', motif: /^[a-zA-Z0-9][\w./-]*( [\w./*:=-]+)*$/ },
  regle: { libelle: 'Commande permanente pour un rôle', motif: /^\^.{3,200}$/ }
};
const refus = m => { throw new ErreurBacklog(m); };

const fichier = racine => path.join(racine, 'droits', 'autorisations.json');
function lire(racine) {
  try { const j = JSON.parse(fs.readFileSync(fichier(racine), 'utf8')); return { sandbox_obligatoire: j.sandbox_obligatoire !== false, liste: Array.isArray(j.liste) ? j.liste : [] }; }
  catch { return { sandbox_obligatoire: true, liste: [] }; }
}
function ecrireAtomique(f, contenu) { const t = f + '.' + process.pid + '.tmp'; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(t, contenu); fs.renameSync(t, f); }

function settings(racine) {
  const a = lire(racine), de = t => a.liste.filter(x => x.type === t).map(x => x.valeur);
  const crochet = cmd => [{ matcher: '*', hooks: [{ type: 'command', command: cmd }] }];
  // Mode sans restriction (Siège › Admin) : ni interdictions, ni bac à sable ; la garde reste branchée pour journaliser
  if (require('./mode-libre').actif(racine)) return {
    _genere_par: 'node siege/droits.js — MODE SANS RESTRICTION activé par le CEO (Siège › Admin)',
    permissions: { deny: [], allow: [] },
    hooks: { PreToolUse: crochet('node "$CLAUDE_PROJECT_DIR/siege/garde.js"'), SubagentStop: crochet('node "$CLAUDE_PROJECT_DIR/siege/garde.js"') },
    sandbox: { enabled: false }
  };
  return {
    _genere_par: 'node siege/droits.js — ne pas modifier à la main : Siège › Droits',
    permissions: {
      deny: ['Read(~/.siege/**)', 'Read(~/.ssh/**)', 'Read(~/.aws/**)', 'Read(~/.config/gh/**)'],   // écriture dans droits/, .claude/, siege/ : refusée par la garde à tous les rôles sauf la session mainteneur
      allow: ['Bash(node siege/backlog.js:*)']
    },
    hooks: {
      PreToolUse: crochet('node "$CLAUDE_PROJECT_DIR/siege/garde.js"'),
      SubagentStop: crochet('node "$CLAUDE_PROJECT_DIR/siege/garde.js"'),
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/siege/garde.js"' }] }]
    },
    sandbox: {
      enabled: true,
      failIfUnavailable: a.sandbox_obligatoire,
      allowUnsandboxedCommands: false,
      excludedCommands: [...OUTILS_SIEGE, ...de('commande')],
      network: { allowedDomains: [...new Set([...DOMAINES_BASE, ...domainesGithub(racine), ...de('domaine')])] },
      filesystem: {
        denyRead: ['~/.siege', '~/.ssh', '~/.aws', '~/.config/gh', '~/.netrc'],
        denyWrite: ['./droits', './.claude', './siege', './portfolio/features.json', './portfolio/bugs.json', './portfolio/commentaires.json', './portfolio/source-backlog.json']
      },
      credentials: { envVars: ['NOTION_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN', 'ANTHROPIC_API_KEY'].map(name => ({ name, mode: 'deny' })) }
    }
  };
}

// Règles permanentes ajoutées par le CEO pour un rôle, fusionnées dans la politique lue par la garde
function reglesEnPlus(racine) {
  const out = {}; for (const x of lire(racine).liste.filter(x => x.type === 'regle')) (out[x.role] = out[x.role] || []).push(x.valeur);
  return out;
}

function generer(racine) { ecrireAtomique(path.join(racine, '.claude', 'settings.json'), JSON.stringify(settings(racine), null, 2) + '\n'); }

function ajouter(racine, { type, valeur, role, motif }, roles) {
  const t = TYPES[type] || refus('Type : ' + Object.keys(TYPES).join(', '));
  valeur = String(valeur || '').trim();
  if (!t.motif.test(valeur)) refus(t.libelle + ' invalide : ' + valeur);
  if (type === 'regle') { if (!roles.includes(role)) refus('Rôle inconnu'); try { new RegExp(valeur); } catch { refus('Expression invalide'); } }
  if (type === 'commande' && /^(bash|sh|zsh|sudo|curl|wget|nc|ssh|scp|rm|node|python3?|env|xargs|eval)\b/.test(valeur)) refus('Commande trop générale pour sortir du bac à sable');
  motif = String(motif || '').trim().slice(0, 300); if (motif.length < 10) refus('Motif obligatoire (pourquoi cette autorisation permanente)');
  const a = lire(racine);
  if (a.liste.some(x => x.type === type && x.valeur === valeur && (x.role || '') === (role || ''))) refus('Déjà autorisé');
  const n = { id: 'AUT-' + String(Math.max(0, ...a.liste.map(x => Number(x.id.slice(4)) || 0)) + 1).padStart(3, '0'), type, valeur, role: type === 'regle' ? role : '', motif, ajoutee_le: new Date().toISOString(), par: 'CEO' };
  a.liste.push(n); ecrireAtomique(fichier(racine), JSON.stringify(a, null, 2) + '\n'); generer(racine);
  return n;
}
function retirer(racine, id) {
  const a = lire(racine), i = a.liste.findIndex(x => x.id === id); if (i < 0) refus('Autorisation introuvable');
  a.liste.splice(i, 1); ecrireAtomique(fichier(racine), JSON.stringify(a, null, 2) + '\n'); generer(racine);
}
function sandboxObligatoire(racine, oui) { const a = lire(racine); a.sandbox_obligatoire = !!oui; ecrireAtomique(fichier(racine), JSON.stringify(a, null, 2) + '\n'); generer(racine); }

module.exports = { settings, generer, lire, ajouter, retirer, reglesEnPlus, sandboxObligatoire, TYPES, DOMAINES_BASE };
