'use strict';
require('./_humain');
// Moteurs d'agents : détection (faux codex), activation par le CEO, refus par la garde et par l'outil, agent Codex de bout
// en bout (bac à sable demandé, réseau coupé, passation inscrite sur le ticket).
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');

function siege() {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-mot-')), R = path.resolve(__dirname, '..', '..');
  for (const d of ['droits', 'portfolio', 'projets/api', '.claude/agents', 'prive', 'bin']) fs.mkdirSync(path.join(T, d), { recursive: true });
  fs.copyFileSync(path.join(R, '.claude', 'agents', 'dev-backend.md'), path.join(T, '.claude', 'agents', 'dev-backend.md'));
  fs.writeFileSync(path.join(T, '.claude', 'agents', 'rapide.md'), '---\nname: rapide\ndescription: x\nmodel: haiku\n---\nTu es rapide.\n');
  fs.writeFileSync(path.join(T, 'portfolio', 'filiales.md'), '| Filiale | Préfixe | Dossier | Repo git | Statut |\n|---|---|---|---|---|\n| API | API | `projets/api` | `projets/api` | Active |\n');
  fs.writeFileSync(path.join(T, 'portfolio', 'features.json'), JSON.stringify({ elements: [{ id: 'API-001', titre: 'Santé', rang: 1, filiale: 'API', statut: 'En cours', dependances: [] }] }));
  fs.writeFileSync(path.join(T, 'portfolio', 'source-backlog.json'), '{"type":"fichier"}');
  fs.writeFileSync(path.join(T, 'projets', 'api', 'CLAUDE.md'), '# Fiche filiale — API\n');
  // Faux codex : version, catalogue, et exec qui note ses arguments puis écrit sa passation (-o)
  const codex = path.join(T, 'bin', 'codex');
  fs.writeFileSync(codex, `#!/usr/bin/env node
const a = process.argv.slice(2), fs = require('fs');
if (a[0] === '--version') { console.log('codex-cli 9.9.9'); process.exit(0); }
if (a[0] === 'debug') { console.log(JSON.stringify({ models: [{ slug: 'gpt-b', display_name: 'B', visibility: 'list', priority: 2 }, { slug: 'gpt-a', display_name: 'A', visibility: 'list', priority: 1 }, { slug: 'cache', visibility: 'hide' }] })); process.exit(0); }
if (a[0] === 'exec') { fs.writeFileSync(${JSON.stringify(path.join(T, 'prive', 'args.json'))}, JSON.stringify(a)); fs.writeFileSync('fait.txt', 'ok'); fs.writeFileSync(a[a.indexOf('-o') + 1], 'Fait : endpoint /sante\\nLivrables : src/sante.js'); process.exit(0); }
process.exit(2);
`, { mode: 0o755 });
  return { T, R, env: { ...process.env, SIEGE_RACINE: T, SIEGE_PRIVE: path.join(T, 'prive'), CODEX_BIN: codex, GEMINI_BIN: path.join(T, 'bin', 'absent') } };
}
const node = (env, args, cwd) => spawnSync(process.execPath, args, { env, cwd, encoding: 'utf8' });

test('moteurs : détection, activation par le CEO, refus d\'un modèle désactivé par la garde', () => {
  const { T, R, env } = siege();
  const lire = () => JSON.parse(node(env, ['-e', `require(${JSON.stringify(path.join(R, 'siege/lib/moteurs'))}).detecter().then(l => console.log(JSON.stringify(l)))`]).stdout);
  let l = lire();
  const codex = l.find(m => m.nom === 'codex');
  assert.deepStrictEqual([codex.installe, codex.version, codex.actif, codex.modeles.map(m => m.id)], [true, 'codex-cli 9.9.9', false, ['gpt-a', 'gpt-b']]);
  assert.strictEqual(l.find(m => m.nom === 'gemini').installe, false);
  assert.strictEqual(l.find(m => m.nom === 'claude').actif !== undefined, true);
  const M = `const m = require(${JSON.stringify(path.join(R, 'siege/lib/moteurs'))});`;
  node(env, ['-e', M + `m.activerMoteur('codex', true); m.activerModele('codex', 'gpt-b', false); m.ajouterModele('codex', 'gpt-perso'); m.activerModele('claude', 'claude-haiku-5-5', false);`]);
  l = lire();
  assert.deepStrictEqual(l.find(m => m.nom === 'codex').modeles.map(m => [m.id, m.actif, m.source]), [['gpt-a', true, 'détecté'], ['gpt-b', false, 'détecté'], ['gpt-perso', true, 'ajouté']]);
  // Garde : un sous-agent Claude dont le modèle (paramètre ou définition) est désactivé est refusé
  fs.cpSync(path.join(R, 'siege'), path.join(T, 'siege'), { recursive: true }); fs.cpSync(path.join(R, 'droits', 'roles.json'), path.join(T, 'droits', 'roles.json'));
  const garde = input => spawnSync(process.execPath, [path.join(T, 'siege', 'garde.js')], { env, input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Agent', tool_input: input }), encoding: 'utf8' });
  const r1 = garde({ subagent_type: 'rapide', prompt: 'x' });
  assert.strictEqual(r1.status, 2); assert.match(r1.stderr, /claude-haiku-5-5 désactivé/);
  assert.strictEqual(garde({ subagent_type: 'rapide', model: 'sonnet', prompt: 'x' }).status, 0);
  assert.strictEqual(garde({ subagent_type: 'dev-backend', model: 'claude-haiku-5-5', prompt: 'x' }).status, 2);
});

test('agent Codex : refusé tant que le CEO ne l\'a pas activé, puis lancé dans le repo de la filiale sans réseau', () => {
  const { T, R, env } = siege();
  fs.cpSync(path.join(R, 'siege'), path.join(T, 'siege'), { recursive: true });
  const lancer = (extra = []) => node(env, [path.join(T, 'siege', 'agent.js'), 'lancer', '--moteur', 'codex', '--modele', 'gpt-a', '--role', 'dev-backend', '--filiale', 'API',
    '--ticket', 'API-001', '--etape', '4 · Développement', '--mission', 'Ajouter un endpoint GET /sante qui renvoie 200 et ses tests.', ...extra], T);
  let r = lancer(); assert.strictEqual(r.status, 1); assert.match(r.stderr, /désactivé par le CEO/);
  node(env, ['-e', `const m = require(${JSON.stringify(path.join(T, 'siege/lib/moteurs'))}); m.activerMoteur('codex', true); m.activerModele('codex', 'gpt-b', false);`]);
  r = node(env, [path.join(T, 'siege', 'agent.js'), 'lancer', '--moteur', 'codex', '--modele', 'gpt-b', '--role', 'dev-backend', '--filiale', 'API', '--ticket', 'API-001', '--etape', '4', '--mission', 'Une mission assez longue pour passer.'], T);
  assert.match(r.stderr, /gpt-b désactivé/);
  r = node(env, [path.join(T, 'siege', 'agent.js'), 'lancer', '--moteur', 'codex', '--modele', 'gpt-a', '--role', 'architecte', '--filiale', 'API', '--ticket', 'API-001', '--etape', '2', '--mission', 'Une mission assez longue pour passer.'], T);
  assert.match(r.stderr, /--role/);
  r = lancer(); assert.strictEqual(r.status, 0, r.stderr);
  const a = JSON.parse(fs.readFileSync(path.join(T, 'prive', 'args.json'), 'utf8'));
  const val = k => a[a.indexOf(k) + 1];
  assert.deepStrictEqual([val('-m'), val('-C'), val('-s'), val('-c')], ['gpt-a', path.join(T, 'projets', 'api'), 'workspace-write', 'sandbox_workspace_write.network_access=false']);
  assert.ok(a.includes('--ephemeral') && a.includes('--ignore-user-config'));
  assert.match(a.at(-1), /Ticket : API-001\nÉtape : 4 · Développement/);
  assert.ok(fs.existsSync(path.join(T, 'projets', 'api', 'fait.txt')), 'travail fait dans le repo de la filiale');
  const c = JSON.parse(fs.readFileSync(path.join(T, 'portfolio', 'commentaires.json'), 'utf8'));
  assert.match(JSON.stringify(c), /Passation \(Codex gpt-a, \d+ s\) · Fait : endpoint \/sante Livrables : src\/sante.js/);
  assert.match(r.stdout, /Passation inscrite sur API-001/);
});

test('garde : un agent Codex suit la règle « une session = une étape »', () => {
  const { T, R, env } = siege();
  fs.cpSync(path.join(R, 'siege'), path.join(T, 'siege'), { recursive: true }); fs.cpSync(path.join(R, 'droits', 'roles.json'), path.join(T, 'droits', 'roles.json'));
  const g = cmd => spawnSync(process.execPath, [path.join(T, 'siege', 'garde.js')], { env, encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'dir-1', tool_name: 'Bash', tool_input: { command: cmd } }) });
  assert.strictEqual(g('node siege/agent.js lancer --moteur codex --modele gpt-a --role qa --filiale API --ticket API-001 --etape "5 · Recette" --mission "Rejouer le plan de tests"').status, 0);
  const r = g('node siege/agent.js lancer --moteur codex --modele gpt-a --role dev-backend --filiale API --ticket API-001 --etape "6 · Revue" --mission "x"');
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /nouvelle session/);
});
