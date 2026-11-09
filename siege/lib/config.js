// Où vit le backlog : `portfolio/source-backlog.json` (versionnable, sans secret).
//   { "type": "fichier" }  → portfolio/features.json et portfolio/bugs.json
//   { "type": "notion", "page": "<id>", "bases": { "features": "<id>", "bugs": "<id>" } }
//   { "type": "jira", "url": "…", "mode": "cloud|dc", "email": "…", "projet": "PROJ", "etiquette": "bureau-ia",
//     "types": { "features": "Story", "bugs": "Bug" }, "champs": { "<libellé>": "customfield_…" }, "statuts": {} }
// Les jetons ne sont jamais dans le dépôt : NOTION_TOKEN / JIRA_TOKEN, sinon ~/.siege/notion-token et ~/.siege/jira-token (600).
'use strict';
const fs = require('fs'), fsp = fs.promises, path = require('path'), os = require('os');
const { SourceFichier, ErreurBacklog, COLLECTIONS } = require('./backlog');
const { SourceNotion } = require('./notion');
const { SourceJira } = require('./jira');

const RACINE = process.env.SIEGE_RACINE || path.resolve(__dirname, '..', '..');
const F = {
  racine: RACINE,
  source: path.join(RACINE, 'portfolio', 'source-backlog.json'),
  fichier: nom => path.join(RACINE, 'portfolio', nom + '.json'),
  filiales: path.join(RACINE, 'portfolio', 'filiales.md'),
  agents: path.join(RACINE, '.claude', 'agents'),
  prive: process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege')
};
const F_JETON = () => path.join(F.prive, 'notion-token'), F_JIRA = () => path.join(F.prive, 'jira-token');

function lireSource() { try { const s = JSON.parse(fs.readFileSync(F.source, 'utf8')); return s && s.type ? s : { type: 'fichier' }; } catch { return { type: 'fichier' }; } }
async function ecrireSource(s) {
  const tmp = F.source + '.tmp'; await fsp.mkdir(path.dirname(F.source), { recursive: true });
  await fsp.writeFile(tmp, JSON.stringify(s, null, 2) + '\n'); await fsp.rename(tmp, F.source);
}
function jeton() {
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN.trim();
  try { return fs.readFileSync(F_JETON(), 'utf8').trim(); } catch { return ''; }
}
async function enregistrerJeton(v) {
  v = String(v || '').trim();
  if (!/^(secret_|ntn_)[A-Za-z0-9]{20,80}$/.test(v)) throw new ErreurBacklog('Jeton Notion attendu (il commence par ntn_ ou secret_)');
  await fsp.mkdir(F.prive, { recursive: true, mode: 0o700 });
  await fsp.writeFile(F_JETON(), v, { mode: 0o600 }); await fsp.chmod(F_JETON(), 0o600);
}

function jetonJira() {
  if (process.env.JIRA_TOKEN) return process.env.JIRA_TOKEN.trim();
  try { return fs.readFileSync(F_JIRA(), 'utf8').trim(); } catch { return ''; }
}
async function enregistrerJetonJira(v) {
  v = String(v || '').trim();
  if (!/^[A-Za-z0-9_\-=+/.]{20,400}$/.test(v)) throw new ErreurBacklog('Jeton Jira attendu (jeton d\'API Cloud ou jeton personnel Data Center)');
  await fsp.mkdir(F.prive, { recursive: true, mode: 0o700 });
  await fsp.writeFile(F_JIRA(), v, { mode: 0o600 }); await fsp.chmod(F_JIRA(), 0o600);
}

// Source active d'une collection ; une source Notion incomplète lève une erreur explicite (jamais de repli silencieux)
function source(nom) {
  if (!COLLECTIONS[nom]) throw new ErreurBacklog('Collection inconnue : ' + nom);
  const s = lireSource();
  if (s.type === 'notion') return new SourceNotion({ jeton: jeton(), base: (s.bases || {})[nom], collection: nom });
  if (s.type === 'jira') return new SourceJira({ config: s, jeton: jetonJira(), collection: nom });
  return new SourceFichier(nom, F.fichier(nom));
}
const sourcesLocales = () => Object.fromEntries(Object.keys(COLLECTIONS).map(n => [n, new SourceFichier(n, F.fichier(n))]));

module.exports = { F, lireSource, ecrireSource, jeton, enregistrerJeton, jetonJira, enregistrerJetonJira, source, sourcesLocales };
