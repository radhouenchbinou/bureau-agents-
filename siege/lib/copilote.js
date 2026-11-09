// GitHub Copilot CLI : connexion et lancement, pour les agents Copilot du Siège.
// Connexion comme dans l'extension Copilot des IDE : soit github.com, soit GitHub Enterprise Cloud (<nom>.ghe.com).
//   - par le compte : `copilot login` (github.com) ou `copilot login --host <nom>.ghe.com`, une fois, sur ce poste
//     (jeton gardé par Copilot dans le trousseau du système : Gestionnaire d'identification sous Windows) ;
//   - ou par un jeton fin (github_pat_…, permission « Copilot Requests ») ou OAuth (gho_…), gardé dans ~/.siege (600)
//     et passé en COPILOT_GITHUB_TOKEN. Les jetons classiques (ghp_…) ne sont pas acceptés par Copilot CLI.
// Réglages dans ~/.siege/copilot.json : { "connexion": "github.com" | "ghe.com", "hote": "<nom>.ghe.com" }.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const PRIVE = () => process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege');
const F = () => path.join(PRIVE(), 'copilot.json'), F_JETON = () => path.join(PRIVE(), 'copilot-token');
const HOTE = /^[a-z0-9][a-z0-9-]{0,62}\.ghe\.com$/;

class ErreurCopilot extends Error {}
const refus = m => { throw new ErreurCopilot(m); };
function ecrire(f, contenu) { fs.mkdirSync(PRIVE(), { recursive: true, mode: 0o700 }); const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, contenu, { mode: 0o600 }); fs.renameSync(t, f); try { fs.chmodSync(f, 0o600); } catch {} }

function lire() { try { const c = JSON.parse(fs.readFileSync(F(), 'utf8')); return { connexion: c.connexion === 'ghe.com' ? 'ghe.com' : 'github.com', hote: c.hote || '' }; } catch { return { connexion: 'github.com', hote: '' }; } }
function configurer({ connexion, hote }) {
  if (!['github.com', 'ghe.com'].includes(connexion)) refus('Connexion : github.com ou GitHub Enterprise Cloud (ghe.com)');
  hote = String(hote || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (connexion === 'ghe.com' && !HOTE.test(hote)) refus('Adresse GitHub Enterprise Cloud attendue : <nom>.ghe.com');
  ecrire(F(), JSON.stringify({ connexion, hote: connexion === 'ghe.com' ? hote : '' }));
}
function jeton() { if (process.env.COPILOT_GITHUB_TOKEN) return process.env.COPILOT_GITHUB_TOKEN.trim(); try { return fs.readFileSync(F_JETON(), 'utf8').trim(); } catch { return ''; } }
function enregistrerJeton(v) {
  v = String(v || '').trim();
  if (/^ghp_/.test(v)) refus('Les jetons classiques (ghp_…) ne sont pas acceptés par Copilot CLI : jeton fin (github_pat_…) avec la permission « Copilot Requests », ou connexion par compte (copilot login)');
  if (!/^(github_pat_|gho_|ghu_)[A-Za-z0-9_]{20,255}$/.test(v)) refus('Jeton attendu : github_pat_… (jeton fin, permission « Copilot Requests »), gho_… ou ghu_…');
  ecrire(F_JETON(), v);
}
function oublierJeton() { try { fs.unlinkSync(F_JETON()); } catch {} }
// Commande de connexion à lancer une fois par le CEO dans un terminal (le navigateur s'ouvre ; --device-code sinon)
function commandeConnexion() { const c = lire(); return c.connexion === 'ghe.com' && c.hote ? `copilot login --host ${c.hote}` : 'copilot login'; }

// Environnement d'une session Copilot : jeton du Siège s'il y en a un, hôte GitHub Enterprise Cloud sinon celui du login
function env(base = process.env) {
  const c = lire(), j = jeton(), e = { ...base };
  for (const k of ['GH_TOKEN', 'GITHUB_TOKEN']) delete e[k];        // jamais le jeton GitHub de l'App ou du poste par erreur
  if (j) e.COPILOT_GITHUB_TOKEN = j; else delete e.COPILOT_GITHUB_TOKEN;
  if (c.connexion === 'ghe.com' && c.hote) e.GH_HOST = c.hote; else delete e.GH_HOST;
  return e;
}

// Exécutable : sous Windows, npm installe copilot.cmd ; on lance directement son script avec node (pas de cmd.exe,
// donc aucun risque d'interprétation de la consigne par le shell)
function executable() {
  if (process.env.COPILOT_BIN) return /\.(c?js|mjs)$/.test(process.env.COPILOT_BIN) ? { cmd: process.execPath, avant: [process.env.COPILOT_BIN] } : { cmd: process.env.COPILOT_BIN, avant: [] };
  if (process.platform !== 'win32') return { cmd: 'copilot', avant: [] };
  const racines = [process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules'), process.env.npm_config_prefix && path.join(process.env.npm_config_prefix, 'node_modules')].filter(Boolean);
  for (const r of racines) {
    const dir = path.join(r, '@github', 'copilot');
    try { const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')), b = typeof p.bin === 'string' ? p.bin : (p.bin || {}).copilot; if (b) return { cmd: process.execPath, avant: [path.join(dir, b)] }; } catch {}
  }
  return { cmd: 'copilot.exe', avant: [] };
}

module.exports = { lire, configurer, jeton, enregistrerJeton, oublierJeton, commandeConnexion, env, executable, ErreurCopilot, HOTE };
