'use strict';
// C3 : verrou inter-processus et identifiants réservés sous verrou
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const { SourceFichier } = require('../lib/backlog');

test('C3 : créations concurrentes sans identifiant en double et sans modification perdue', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-verrou-')), s = new SourceFichier('features', path.join(d, 'features.json'));
  const N = 20;
  const crees = await Promise.all(Array.from({ length: N }, (_, i) => s.creerAvecId('COL', { titre: 'T' + i, rang: i + 1, filiale: 'Collecte' })));
  const ids = crees.map(e => e.id);
  assert.strictEqual(new Set(ids).size, N, 'identifiants distincts');
  assert.strictEqual((await s.lister()).length, N, 'aucune création perdue');
  await Promise.all(ids.map((id, i) => s.modifier(id, { titre: 'M' + i })));
  const titres = (await s.lister()).map(e => e.titre).sort();
  assert.strictEqual(titres.filter(t => t.startsWith('M')).length, N, 'aucune modification perdue');
  assert.ok(!fs.existsSync(path.join(d, 'features.json.lock')), 'verrou libéré');
});

test('C3 : 20 processus distincts créent en parallèle, identifiants uniques, rien de perdu', async () => {
  const { spawn } = require('child_process');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-verrou-proc-'));
  const fichier = path.join(d, 'features.json');
  const lib = path.resolve(__dirname, '..', 'lib', 'backlog.js');
  const script = `const { SourceFichier } = require(${JSON.stringify(lib)});
    new SourceFichier('features', ${JSON.stringify(fichier)}).creerAvecId('COL', { titre: process.argv[1], rang: 1, filiale: 'Collecte' })
      .then(e => console.log(e.id), e => { console.error(e.message); process.exit(1); });`;
  const N = 20;
  const lancer = i => new Promise((ok, ko) => {
    const p = spawn(process.execPath, ['-e', script, 'P' + i], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', c => { out += c; }); p.stderr.on('data', c => { err += c; });
    p.on('exit', code => code === 0 ? ok(out.trim()) : ko(new Error('processus ' + i + ' : ' + err)));
  });
  const ids = await Promise.all(Array.from({ length: N }, (_, i) => lancer(i)));
  assert.strictEqual(new Set(ids).size, N, 'identifiants distincts entre processus');
  const lus = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  assert.strictEqual(lus.elements.length, N, 'aucune création perdue entre processus');
  assert.ok(!fs.existsSync(fichier + '.lock'), 'verrou libéré');
});
