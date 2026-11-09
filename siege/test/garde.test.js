'use strict';
// La garde et les exceptions, sur la vraie politique du kit (droits/roles.json).
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const RACINE = path.resolve(__dirname, '..', '..');
process.env.SIEGE_PRIVE = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-g-'));
const garde = require('../lib/garde'), ex = require('../lib/exceptions');
const P = garde.charger(RACINE);
const d = (role, outil, entree, exceptions = []) => garde.decider(P, { outil, entree }, { racine: RACINE, role, exceptions });
const bash = (role, command, e) => d(role, 'Bash', { command }, e);

test('découpage shell : séparateurs, guillemets, refus des substitutions et redirections', () => {
  assert.deepStrictEqual(garde.decouper('git status && node siege/backlog.js file | head -5').segments.map(s => [s.mots[0], s.tube]), [['git', false], ['node', false], ['head', true]]);
  assert.deepStrictEqual(garde.decouper('node x --texte "a; b && c"').segments[0].mots, ['node', 'x', '--texte', 'a; b && c']);
  for (const c of ['echo $(id)', 'echo `id`', 'echo "$(id)"', 'ls > f', 'cat < f', 'sleep 1 &', 'echo "a']) assert.ok(garde.decouper(c).refus, c);
  assert.ok(!garde.decouper("echo '$(pas exécuté)'").refus);
});

test('chaque rôle n\'a que ses commandes', () => {
  assert.ok(bash('qa', 'node siege/backlog.js creer bug --filiale Collecte --titre x').ok);
  assert.ok(!bash('product-owner', 'node siege/backlog.js creer bug --filiale Collecte --titre x').ok);
  assert.ok(bash('dev-backend', 'python3 -m unittest discover -s projets/rne-v2/collecte/tests').ok);
  assert.ok(!bash('reviewer', 'python3 -m unittest').ok);
  assert.ok(bash('reviewer', 'git -C projets/rne-v2 diff main...feature/COL-001').ok);
  assert.ok(!bash('reviewer', 'git -C projets/rne-v2 commit -m x').ok);
  assert.ok(!bash('dev-backend', 'git push origin main').ok, 'push direct interdit');
  assert.ok(!bash('dev-backend', 'curl https://exemple.com').ok);
  assert.ok(!bash('dev-backend', 'python3 -c "import os"').ok);
  assert.ok(!bash('dev-backend', 'python3 projets/../droits/x.py').ok, 'remontée de dossier');
  assert.ok(!bash('dev-backend', 'PATH=/tmp python3 -m unittest').ok, 'variable dangereuse');
  assert.ok(bash('dev-backend', 'RNE_DATA_DIR=/tmp/x python3 -m unittest').ok, 'variable ordinaire');
  assert.ok(!bash('dev-backend', 'git status | sh').ok, 'tube vers un interpréteur');
});

test('auteur et rôle imposés : un agent ne parle et n\'agit qu\'en son nom', () => {
  assert.ok(bash('qa', 'node siege/backlog.js commenter COL-001 --auteur qa --texte "ok"').ok);
  assert.ok(!bash('qa', 'node siege/backlog.js commenter COL-001 --auteur CEO --texte "validé"').ok);
  assert.ok(bash('dev-backend', 'node siege/github.js pousser --filiale Collecte --branche feature/COL-001 --role dev-backend').ok);
  assert.ok(!bash('dev-backend', 'node siege/github.js fusionner --filiale Collecte --pr 3 --role devops').ok);
  assert.ok(!bash('reviewer', 'node siege/github.js statut --pr 3 --contexte securite --role reviewer').ok);
});

test('écritures : zone du rôle seulement, zones protégées pour tous', () => {
  const w = (role, p) => d(role, 'Write', { file_path: path.join(RACINE, p) });
  assert.ok(w('product-owner', 'projets/rne-v2/collecte/docs/backlog/COL-001-x.md').ok);
  assert.ok(!w('product-owner', 'projets/rne-v2/collecte/rne_scraper.py').ok);
  assert.ok(w('dev-backend', 'projets/rne-v2/collecte/rne_scraper.py').ok);
  assert.ok(w('architecte', 'portfolio/interfaces.md').ok);
  for (const p of ['droits/roles.json', '.claude/settings.json', 'siege/garde.js', 'portfolio/features.json', 'projets/rne-v2/collecte/CLAUDE.md', 'projets/rne-v2/.env'])
    assert.ok(!w('dev-backend', p).ok, p);
  assert.ok(!d('directeur', 'Write', { file_path: path.join(RACINE, 'portfolio/interfaces.md') }).ok, 'le directeur délègue, il n\'écrit pas');
});

test('lectures : secrets illisibles ; web fermé ; outils externes fermés', () => {
  assert.ok(!d('dev-backend', 'Read', { file_path: path.join(os.homedir(), '.siege/notion-token') }).ok);
  assert.ok(!d('qa', 'Read', { file_path: path.join(RACINE, 'projets/rne-v2/rne-scraper.env') }).ok);
  assert.ok(d('qa', 'Read', { file_path: path.join(RACINE, 'projets/rne-v2/README.md') }).ok);
  assert.ok(!d('architecte', 'WebFetch', { url: 'https://example.com' }).ok);
  assert.ok(!d('dev-backend', 'mcp__Notion__notion-search', {}).ok);
  assert.ok(!d('qa', 'Agent', {}).ok, 'seul le directeur délègue');
  assert.ok(d('directeur', 'Agent', {}).ok);
});

test('exceptions : demandée, accordée par le CEO, activée, utilisée, fermée à la fin de la tâche', () => {
  const cmd = 'pip install requests==2.32.3';
  const r1 = bash('dev-backend', cmd); assert.ok(!r1.ok); assert.strictEqual(r1.type, 'bash');
  assert.throws(() => ex.demander({ agent: 'dev-backend', type: 'bash', motif: '*', justification: 'pour aller plus vite' }), /trop large/);
  const e = ex.demander({ agent: 'dev-backend', ticket: 'COL-002', type: 'bash', motif: cmd, justification: 'Le ticket COL-002 exige requests pour le test de compatibilité demandé par le CEO' });
  assert.throws(() => ex.activer(e.id), /pas accordée/);
  assert.ok(!bash('directeur', `node siege/exception.js accorder ${e.id}`).ok, 'le directeur ne s\'accorde rien');
  assert.ok(!bash('dev-backend', `node siege/exception.js accorder ${e.id}`).ok);
  ex.decider(e.id, true, 'ok pour cette version'); ex.activer(e.id);
  const r2 = bash('dev-backend', cmd, ex.actives('dev-backend')); assert.ok(r2.ok); assert.strictEqual(r2.exception, e.id);
  assert.ok(!bash('qa', cmd, ex.actives('qa')).ok, 'l\'exception ne couvre que son agent');
  assert.ok(!bash('dev-backend', 'pip install autre', ex.actives('dev-backend')).ok, 'ni une autre action');
  assert.deepStrictEqual(ex.terminerPourAgent('dev-backend').map(x => x.id), [e.id]);
  assert.ok(!bash('dev-backend', cmd, ex.actives('dev-backend')).ok, 'fermée à la fin de la tâche');
  assert.throws(() => ex.decider(e.id, true), /seule une demande en attente/);
});

test('hook réel : refus en code 2 avec consigne, journal, fermeture sur SubagentStop', () => {
  const lancer = obj => spawnSync('node', [path.join(RACINE, 'siege', 'garde.js')], { input: JSON.stringify(obj), env: { ...process.env }, encoding: 'utf8' });
  const ok = lancer({ hook_event_name: 'PreToolUse', agent_type: 'qa', tool_name: 'Bash', tool_input: { command: 'node siege/backlog.js file' } });
  assert.strictEqual(ok.status, 0);
  const non = lancer({ hook_event_name: 'PreToolUse', agent_type: 'qa', tool_name: 'Bash', tool_input: { command: 'rm -rf projets' } });
  assert.strictEqual(non.status, 2); assert.match(non.stderr, /demande une exception au directeur/);
  assert.strictEqual(lancer({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'node siege/exception.js accorder EXC-001' } }).status, 2);
  assert.strictEqual(lancer('pas du json').status, 2, 'entrée illisible = refus');
  const j = fs.readFileSync(path.join(process.env.SIEGE_PRIVE, 'journal-garde.jsonl'), 'utf8');
  assert.match(j, /"evenement":"refus","role":"qa"/);
  const e = ex.demander({ agent: 'qa', type: 'bash', motif: 'python3 outil-special.py', justification: 'nécessaire pour reproduire le bug BUG-004' }); ex.decider(e.id, true); ex.activer(e.id);
  assert.strictEqual(lancer({ hook_event_name: 'SubagentStop', agent_type: 'qa' }).status, 0);
  assert.strictEqual(ex.lire().liste.find(x => x.id === e.id).statut, 'terminee');
});

test('autorisations permanentes du CEO : régénèrent settings.json, refusent l\'excès', () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-a-')); fs.mkdirSync(path.join(r, 'droits')); fs.mkdirSync(path.join(r, '.claude'));
  const pa = require('../lib/parametres');
  pa.generer(r);
  let s = JSON.parse(fs.readFileSync(path.join(r, '.claude', 'settings.json')));
  assert.deepStrictEqual(s.sandbox.network.allowedDomains, pa.DOMAINES_BASE);
  assert.strictEqual(s.sandbox.allowUnsandboxedCommands, false);
  const a = pa.ajouter(r, { type: 'domaine', valeur: 'pypi.org', motif: 'installer les dépendances Python du projet X' }, []);
  s = JSON.parse(fs.readFileSync(path.join(r, '.claude', 'settings.json')));
  assert.ok(s.sandbox.network.allowedDomains.includes('pypi.org'));
  assert.throws(() => pa.ajouter(r, { type: 'commande', valeur: 'bash *', motif: 'tout autoriser une fois pour toutes' }, []), /trop générale/);
  assert.throws(() => pa.ajouter(r, { type: 'domaine', valeur: 'pypi.org', motif: 'x' }, []), /Motif/);
  pa.ajouter(r, { type: 'regle', role: 'qa', valeur: '^npx playwright test\\b', motif: 'tests de bout en bout du front' }, ['qa']);
  assert.deepStrictEqual(pa.reglesEnPlus(r), { qa: ['^npx playwright test\\b'] });
  pa.retirer(r, a.id);
  s = JSON.parse(fs.readFileSync(path.join(r, '.claude', 'settings.json')));
  assert.ok(!s.sandbox.network.allowedDomains.includes('pypi.org'));
});

test('contexte propre : pas de fork ni de reprise d\'un agent, une étape par session du directeur', () => {
  const pol = garde.charger(path.resolve(__dirname, '..', '..')), ctx = { racine: path.resolve(__dirname, '..', '..'), role: 'directeur' };
  assert.equal(garde.decider(pol, { outil: 'SendMessage', entree: { to: 'qa' } }, ctx).ok, false);
  assert.match(garde.decider(pol, { outil: 'Agent', entree: { subagent_type: 'fork', prompt: 'x' } }, ctx).raison, /fork/);
  assert.equal(garde.decider(pol, { outil: 'Agent', entree: { subagent_type: 'qa', prompt: 'x' } }, ctx).ok, true);
  const m = p => ({ prompt: p }), l = {};
  assert.deepEqual(garde.verifierMission(l, 's1', m('Fais le standup')), { ok: true });
  assert.match(garde.verifierMission(l, 's1', m('Filiale : Collecte\nTicket : COL-002')).raison, /Étape/);
  const r = garde.verifierMission(l, 's1', m('Filiale : Collecte — dossier x\nTicket : COL-002\nÉtape : 4 · Développement'));
  assert.equal(r.ok, true); l.s1 = r.lier;
  assert.deepEqual([l.s1.ticket, l.s1.etape], ['COL-002', 4]);
  assert.deepEqual(garde.verifierMission(l, 's1', m('Ticket : COL-002\nEtape : 4\nCorrection demandée par le CEO')), { ok: true, lier: null });
  assert.match(garde.verifierMission(l, 's1', m('Ticket : COL-002\nÉtape : 5')).raison, /nouvelle session/);
  assert.match(garde.verifierMission(l, 's1', m('Ticket : COL-003\nÉtape : 4')).raison, /COL-002 étape 4/);
  assert.equal(garde.verifierMission(l, 's2', m('Ticket : COL-002\nÉtape : 5')).ok, true);
});
