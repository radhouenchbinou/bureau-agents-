'use strict';
// Mode autonome, lot 6 : publication d'une instance (push, PR, lecture des feux) contre une fausse API
const test = require('node:test'), assert = require('node:assert');
const { publier, fusionner } = require('../lib/publication');

test('publication : pousse la branche, ouvre la PR vers main, lit les feux du commit', async () => {
  const appels = [], pousses = [];
  const fausse = async (m, chemin, jeton, corps) => {
    appels.push([m, chemin, corps]);
    if (m === 'POST') return { number: 7, head: { sha: 'abc' } };
    return { statuses: [{ context: 'agents/revue', state: 'success' }, { context: 'agents/securite', state: 'pending' }] };
  };
  const pub = publier({ jeton: 'j', repo: 'moi/repo', pousserFn: (d, r, b) => pousses.push([d, r, b]), appelFn: fausse });
  const r = await pub({ ticket: { id: 'EIA-001', titre: 'Titre' }, branche: 'feature/eia-001', dossier: '/tmp/x' });
  assert.deepStrictEqual(pousses, [['/tmp/x', 'moi/repo', 'feature/eia-001']]);
  assert.strictEqual(appels[0][1], '/repos/moi/repo/pulls');
  assert.strictEqual(appels[0][2].head, 'feature/eia-001');
  assert.strictEqual(appels[0][2].base, 'main');
  assert.match(appels[0][2].body, /Generated with/);
  assert.deepStrictEqual([r.pr, r.feux], ['#7', { revue: 'success', securite: 'pending' }]);
});

test('fusion autonome : feux verts suffisent, sans approbation du CEO ; feu rouge = refus', async () => {
  const appels = [];
  const f = async (j, repo, n, opts) => { appels.push(['fusionnable', n, opts]); return { p: { head: { sha: 'abc' } }, manque: [] }; };
  const a = async (m, chemin, j, corps) => { appels.push([m, chemin, corps]); };
  await fusionner({ jeton: 'j', repo: 'moi/repo', fusionnableFn: f, appelFn: a })({ pr: '#7' });
  assert.deepStrictEqual(appels[0], ['fusionnable', 7, { approbation: false }]);
  assert.deepStrictEqual(appels[1], ['PUT', '/repos/moi/repo/pulls/7/merge', { merge_method: 'squash', sha: 'abc' }]);
  const refus = async () => ({ p: { head: { sha: 'abc' } }, manque: ['agents/revue au vert'] });
  await assert.rejects(fusionner({ jeton: 'j', repo: 'moi/repo', fusionnableFn: refus, appelFn: a })({ pr: '#7' }), /agents\/revue au vert/);
});
