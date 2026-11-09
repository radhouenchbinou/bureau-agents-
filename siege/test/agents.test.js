'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const { Agents, analyser, formater } = require('../lib/agents');
const { filiales } = require('../lib/registre');
const { lire, encoder } = require('../lib/activite');

test('agents : lecture des vrais fichiers du kit', async () => {
  const l = await new Agents(path.join(__dirname, '..', '..', '.claude', 'agents')).lister();
  assert.deepStrictEqual(l.filter(a => a.portee === 'filiale').map(a => a.nom).sort(), ['dev-backend', 'dev-frontend', 'product-owner', 'qa']);
  assert.ok(l.every(a => a.description && a.consigne));
});

test('agents : créer, modifier, refuser les noms et outils invalides, supprimer', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-')), ag = new Agents(d);
  const a = { nom: 'data-engineer', description: 'Pipelines\nde données', modele: 'sonnet', outils: ['Read', 'Bash'], consigne: 'Tu es data engineer.' };
  await ag.ecrire(a, { creation: true });
  assert.match(fs.readFileSync(path.join(d, 'data-engineer.md'), 'utf8'), /^---\nname: data-engineer\ndescription: Pipelines de données\ntools: Read, Bash\nmodel: sonnet\n---\n/);
  await assert.rejects(ag.ecrire(a, { creation: true }), /déjà/);
  await assert.rejects(ag.ecrire({ ...a, nom: '../x' }, { creation: true }), /Nom/);
  await assert.rejects(ag.ecrire({ ...a, outils: ['rm'] }, { creation: false }), /Outil/);
  await ag.ecrire({ ...a, modele: 'opus' }, { creation: false });
  assert.strictEqual((await ag.lister())[0].modele, 'opus');
  await ag.supprimer('data-engineer');
  assert.deepStrictEqual(await ag.lister(), []);
  assert.deepStrictEqual(analyser(formater(a), 'x.md').outils, ['Read', 'Bash']);
});

test('registre des filiales : lignes du tableau, préfixes à 3 lettres seulement', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reg-')), 'filiales.md');
  fs.writeFileSync(f, '# Registre\n\n| Filiale | Préfixe | Dossier | Repo git | Statut |\n|---|---|---|---|---|\n| Collecte | COL | `projets/x/collecte` | `projets/x` | Active |\n| Groupe | GRP | `portfolio` | — | Transverse |\n| Mauvaise | TROP | `y` | | |\n');
  assert.deepStrictEqual((await filiales(f)).map(x => [x.nom, x.prefixe, x.dossier, x.repo]), [['Collecte', 'COL', 'projets/x/collecte', 'projets/x'], ['Groupe', 'GRP', 'portfolio', '—']]);
});

test('activité : sessions du Siège et missions des sous-agents', async () => {
  const claude = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-')), racine = '/Users/r/equipe-ia';
  const dir = path.join(claude, 'projects', encoder(racine)), sid = 's1';
  fs.mkdirSync(path.join(dir, sid, 'subagents'), { recursive: true }); fs.mkdirSync(path.join(claude, 'sessions'));
  fs.writeFileSync(path.join(dir, sid + '.jsonl'), '{}\n');
  fs.writeFileSync(path.join(claude, 'sessions', 'x.json'), JSON.stringify({ sessionId: sid, pid: process.pid, status: 'idle' }));
  fs.writeFileSync(path.join(dir, sid, 'subagents', 'a1.meta.json'), JSON.stringify({ agentType: 'qa', description: 'Recette COL-002' }));
  fs.writeFileSync(path.join(dir, sid, 'subagents', 'a1.jsonl'), JSON.stringify({ type: 'user', message: { content: 'Filiale : Collecte — dossier projets/rne-v2/collecte\nMode recette, story COL-002' } }) + '\n');
  fs.mkdirSync(path.join(claude, 'projects', '-Users-r-autre'));   // autre projet : ignoré
  const r = await lire({ racine, dossierClaude: claude });
  assert.strictEqual(r.direction.etat, 'attend_ceo');
  assert.deepStrictEqual([r.missions[0].agent, r.missions[0].filiale, r.missions[0].story, r.missions[0].etat], ['qa', 'Collecte', 'COL-002', 'au_poste']);
});
