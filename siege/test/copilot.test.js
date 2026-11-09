'use strict';
require('./_humain');
// GitHub Copilot CLI : connexion (github.com / ghe.com, jeton fin), agents générés avec la garde en hook, lancement d'un
// agent Copilot par node siege/agent.js (faux copilot), garde au format Copilot (powershell, path, SIEGE_ROLE).
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const R = path.resolve(__dirname, '..', '..');

test('connexion Copilot : github.com ou GitHub Enterprise Cloud, jetons fins seulement', () => {
  process.env.SIEGE_PRIVE = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-cop-')); delete process.env.COPILOT_GITHUB_TOKEN;
  delete require.cache[require.resolve('../lib/copilote')]; const c = require('../lib/copilote');
  assert.strictEqual(c.commandeConnexion(), 'copilot login');
  assert.throws(() => c.configurer({ connexion: 'ghe.com', hote: 'github.entreprise.fr' }), /ghe\.com/);
  c.configurer({ connexion: 'ghe.com', hote: 'https://Acme.ghe.com/' });
  assert.deepStrictEqual([c.lire(), c.commandeConnexion()], [{ connexion: 'ghe.com', hote: 'acme.ghe.com' }, 'copilot login --host acme.ghe.com']);
  assert.throws(() => c.enregistrerJeton('ghp_' + 'a'.repeat(36)), /classiques/);
  c.enregistrerJeton('github_pat_' + 'b'.repeat(40));
  const e = c.env({ PATH: '/bin', GH_TOKEN: 'ne-pas-transmettre', GITHUB_TOKEN: 'non' });
  assert.deepStrictEqual([e.COPILOT_GITHUB_TOKEN.slice(0, 11), e.GH_HOST, e.GH_TOKEN, e.GITHUB_TOKEN], ['github_pat_', 'acme.ghe.com', undefined, undefined]);
  c.oublierJeton(); c.configurer({ connexion: 'github.com' });
  assert.deepStrictEqual([c.env({}).COPILOT_GITHUB_TOKEN, c.env({}).GH_HOST], [undefined, undefined]);
});

test('agents Copilot générés : outils traduits, garde en hook, skills du rôle', () => {
  const t = fs.readFileSync(path.join(R, '.github', 'agents', 'dev-backend.agent.md'), 'utf8');
  assert.match(t, /^---\nname: dev-backend\n/);
  assert.match(t, /tools: \[.*"edit".*"execute".*\]/);
  assert.doesNotMatch(t, /"agent"/, 'un dev ne délègue pas');
  assert.match(t, /PreToolUse:\n\s+- type: command\n\s+bash: 'node "\$SIEGE_RACINE\/siege\/garde\.js"'/);
  assert.match(t, /- tdd-et-changement-minimal/);
  assert.ok(fs.existsSync(path.join(R, '.github', 'skills', 'passation', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(R, '.github', 'agents', 'directeur.agent.md')));
});

test('garde au format Copilot : rôle par SIEGE_ROLE, powershell, chemin sous « path », outil Task', () => {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-copg-'));
  fs.cpSync(path.join(R, 'siege'), path.join(T, 'siege'), { recursive: true }); fs.mkdirSync(path.join(T, 'droits')); fs.mkdirSync(path.join(T, 'projets', 'api'), { recursive: true });
  fs.cpSync(path.join(R, 'droits', 'roles.json'), path.join(T, 'droits', 'roles.json'));
  const g = (tool_name, tool_input, env = {}) => spawnSync(process.execPath, [path.join(T, 'siege', 'garde.js')], { encoding: 'utf8',
    env: { ...process.env, SIEGE_PRIVE: path.join(T, 'prive'), ...env }, input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'c1', cwd: T, tool_name, tool_input }) });
  const dev = { SIEGE_ROLE: 'dev-backend' };
  assert.strictEqual(g('Write', { path: path.join(T, 'projets', 'api', 'src.js'), content: 'x' }, dev).status, 0);
  assert.strictEqual(g('Write', { path: path.join(T, 'droits', 'roles.json'), content: 'x' }, dev).status, 2);
  assert.strictEqual(g('Write', { path: path.join(T, 'projets', 'api', 'src.js'), content: 'x' }).status, 2, 'sans rôle : directeur, qui n\'écrit rien');
  assert.strictEqual(g('powershell', { command: 'node siege\\backlog.js voir API-001' }, { SIEGE_ROLE: 'qa' }).status, 0);
  assert.strictEqual(g('powershell', { command: 'Invoke-WebRequest https://exemple.fr' }, dev).status, 2);
  assert.match(g('Task', { agent_type: 'qa', prompt: 'Ticket : API-001' }).stderr, /Étape/, 'mission d\'un sous-agent Copilot sans étape refusée');
});

test('agent Copilot lancé par le directeur : agent du rôle, garde, sans web, passation sur le ticket', () => {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-copa-'));
  for (const d of ['droits', 'portfolio', 'projets/api', 'prive', 'bin']) fs.mkdirSync(path.join(T, d), { recursive: true });
  fs.cpSync(path.join(R, 'siege'), path.join(T, 'siege'), { recursive: true }); fs.cpSync(path.join(R, '.github'), path.join(T, '.github'), { recursive: true });
  fs.cpSync(path.join(R, '.claude', 'agents'), path.join(T, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(T, 'portfolio', 'filiales.md'), '| Filiale | Préfixe | Dossier | Repo git | Statut |\n|---|---|---|---|---|\n| API | API | `projets/api` | `projets/api` | Active |\n');
  fs.writeFileSync(path.join(T, 'portfolio', 'features.json'), JSON.stringify({ elements: [{ id: 'API-001', titre: 'Santé', rang: 1, filiale: 'API', statut: 'En cours', dependances: [] }] }));
  fs.writeFileSync(path.join(T, 'portfolio', 'source-backlog.json'), '{"type":"fichier"}');
  fs.writeFileSync(path.join(T, 'projets', 'api', 'CLAUDE.md'), '# Fiche filiale — API\n');
  const faux = path.join(T, 'bin', 'copilot.js');
  fs.writeFileSync(faux, `const a = process.argv.slice(2), fs = require('fs');
if (a[0] === '--version') { console.log('GitHub Copilot CLI 9.9.9'); process.exit(0); }
if (a[0] === '--help') { console.log('  --model <model>  (choices: "auto", "gpt-6.1-sol")'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(path.join(T, 'prive', 'appel.json'))}, JSON.stringify({ a, cwd: process.cwd(), role: process.env.SIEGE_ROLE, racine: process.env.SIEGE_RACINE, jeton: process.env.COPILOT_GITHUB_TOKEN || '' }));
console.log('Fait : GET /sante\\nLivrables : src/sante.js');`);
  const env = { ...process.env, SIEGE_RACINE: T, SIEGE_PRIVE: path.join(T, 'prive'), COPILOT_BIN: faux, CODEX_BIN: '/absent', CLAUDE_BIN: '/absent', GEMINI_BIN: '/absent' };
  const node = args => spawnSync(process.execPath, args, { env, cwd: T, encoding: 'utf8' });
  const lancer = modele => node([path.join(T, 'siege', 'agent.js'), 'lancer', '--moteur', 'copilot', '--modele', modele, '--role', 'dev-backend', '--filiale', 'API',
    '--ticket', 'API-001', '--etape', '4 · Développement', '--mission', 'Ajouter un endpoint GET /sante et ses tests.']);
  assert.match(lancer('auto').stderr, /désactivé par le CEO/);
  node(['-e', `require(${JSON.stringify(path.join(T, 'siege/lib/moteurs'))}).activerMoteur('copilot', true)`]);
  const r = lancer('gpt-6.1-sol'); assert.strictEqual(r.status, 0, r.stderr);
  const x = JSON.parse(fs.readFileSync(path.join(T, 'prive', 'appel.json'), 'utf8')), v = k => x.a[x.a.indexOf(k) + 1];
  assert.deepStrictEqual([v('--agent'), v('--add-dir'), v('--model'), v('--deny-tool'), x.cwd, x.role, x.racine], ['dev-backend', T, 'gpt-6.1-sol', 'url', fs.realpathSync(path.join(T, 'projets', 'api')), 'dev-backend', T]);
  assert.ok(x.a.includes('--no-ask-user') && x.a.includes('--silent'));
  assert.match(v('-p'), /Ticket : API-001\nÉtape : 4 · Développement/);
  assert.match(fs.readFileSync(path.join(T, 'portfolio', 'commentaires.json'), 'utf8'), /Passation \(GitHub Copilot CLI gpt-6.1-sol, \d+ s\) · Fait : GET \/sante Livrables : src\/sante.js/);
});
