'use strict';
// N1 (périmètre P0) : file persistante d'exécutions
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const { Executions, NOUVEAUX_ESSAIS_MAX } = require('../lib/executions');

const nouvelle = () => new Executions(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'siege-exe-')), 'executions.json'));
const base = { ticket: 'EIA-007', etape: '4 · Développement', depot: 'projets/entreprise-ia', agent: 'dev-backend' };

test('N1 : une même clé anti-doublon n\'est jamais ajoutée deux fois', () => {
  const x = nouvelle();
  x.demander(base);
  assert.throws(() => x.demander(base), /anti-doublon/);
  assert.strictEqual(x.lire().length, 1);
});

test('N1 : une seule exécution en cours par dépôt à la fois', () => {
  const x = nouvelle();
  x.demander(base);
  x.demander({ ...base, ticket: 'EIA-010' });
  assert.strictEqual(x.demarrerSuivante().ticket, 'EIA-007');
  assert.strictEqual(x.demarrerSuivante(), null, 'le dépôt est occupé');
  const en = x.lire().find(e => e.ticket === 'EIA-007');
  x.terminer(en.id, { reussi: true });
  assert.strictEqual(x.demarrerSuivante().ticket, 'EIA-010');
});

test('N1 : 2 nouveaux essais au plus, puis escalade à un humain', () => {
  const x = nouvelle();
  x.demander(base);
  let courant = null;
  for (let tentative = 0; tentative <= NOUVEAUX_ESSAIS_MAX; tentative++) {
    courant = x.demarrerSuivante();
    assert.ok(courant, 'une exécution doit être prête à l\'essai ' + tentative);
    x.terminer(courant.id, { reussi: false, motif: 'échec ' + tentative });
  }
  assert.strictEqual(x.lire().find(e => e.id === courant.id).etat, 'escalade');
  assert.strictEqual(x.demarrerSuivante(), null, 'plus d\'essai après l\'escalade');
  assert.strictEqual(x.lire().length, NOUVEAUX_ESSAIS_MAX + 1, 'un enregistrement par essai');
});

test('N1 : au redémarrage, une exécution en cours est marquée interrompue, jamais relancée', () => {
  const x = nouvelle();
  x.demander(base);
  const en = x.demarrerSuivante();
  const interrompues = x.reprendre();
  assert.deepStrictEqual(interrompues, [en.id]);
  const e = x.lire().find(y => y.id === en.id);
  assert.strictEqual(e.etat, 'interrompu');
  assert.strictEqual(x.demarrerSuivante(), null, 'rien n\'est relancé automatiquement');
});

test('N1 : écritures concurrentes sans perte', async () => {
  const x = nouvelle();
  const N = 15;
  await Promise.all(Array.from({ length: N }, (_, i) => Promise.resolve().then(() => x.demander({ ...base, ticket: 'EIA-' + String(100 + i) }))));
  assert.strictEqual(x.lire().length, N);
});
