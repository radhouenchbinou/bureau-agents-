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
