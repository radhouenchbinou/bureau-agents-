'use strict';
// Mode autonome, lot 5 : capacité de la machine et boucle parallèle (instances simultanées, livraisons en série)
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const par = require('../lib/parallele');
const { boucleParallele } = require('../lib/autonome');
const { SourceFichier } = require('../lib/backlog');
const wt = require('../lib/worktrees');
const { execFileSync } = require('child_process');

test('capacité : marge de 25 %, charge déjà présente retirée, jamais négatif', () => {
  assert.strictEqual(par.capacite({ cpus: 8, charge: 0, memoireLibre: 64e9 }), 6);
  assert.strictEqual(par.capacite({ cpus: 8, charge: 4, memoireLibre: 64e9 }), 2);
  assert.strictEqual(par.capacite({ cpus: 8, charge: 20, memoireLibre: 64e9 }), 0);
  assert.strictEqual(par.capacite({ cpus: 16, charge: 0, memoireLibre: 3e9 }), 1, 'la mémoire limite');
  assert.strictEqual(par.capacite({ cpus: 16, charge: 0, memoireLibre: 0 }), 0);
});

test('verrou : une seule livraison à la fois', async () => {
  const serie = par.verrou();
  let actifs = 0, pic = 0;
  const tache = () => new Promise(r => { actifs++; pic = Math.max(pic, actifs); setTimeout(() => { actifs--; r(); }, 20); });
  await Promise.all([1, 2, 3].map(() => serie(tache)));
  assert.strictEqual(pic, 1);
});

async function fixture(n) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-par-'));
  const r = path.join(d, 'repo');
  fs.mkdirSync(r);
  execFileSync('git', ['init', '-q', '-b', 'main', r]);
  fs.writeFileSync(path.join(r, 'README.md'), 'x\n');
  execFileSync('git', ['-C', r, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.']);
  execFileSync('git', ['-C', r, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init']);
  const src = new SourceFichier('features', path.join(d, 'features.json'));
  for (let i = 1; i <= n; i++) await src.creerAvecId('EIA', { titre: 'Tache ' + i, rang: i, filiale: 'Entreprise IA', statut: 'À faire', dependances: [] });
  return { r, base: path.join(d, 'instances'), src, charger: async () => ({ features: await src.lister(), bugs: [] }) };
}

test('boucle parallèle : la concurrence suit la capacité, chaque ticket traité une fois', async () => {
  const { r, base, src, charger } = await fixture(4);
  let actifs = 0, pic = 0;
  const runner = async ({ dossier, ticket }) => {
    actifs++; pic = Math.max(pic, actifs);
    await new Promise(res => setTimeout(res, 60));
    fs.writeFileSync(path.join(dossier, ticket.id + '.txt'), 'ok');
    actifs--;
    return { ok: true };
  };
  const bilan = await boucleParallele({ charger, src, racine: r, base, runner, max: 4, capacite: () => 2, intervalleMs: 20 });
  assert.strictEqual(pic, 2, 'deux instances en même temps, pas plus');
  const traites = bilan.map(b => b.ticket).sort();
  assert.deepStrictEqual(traites, ['EIA-001', 'EIA-002', 'EIA-003', 'EIA-004']);
});

test('boucle parallèle : capacité 1 = séquentiel', async () => {
  const { r, base, src, charger } = await fixture(2);
  let actifs = 0, pic = 0;
  const runner = async ({ dossier, ticket }) => {
    actifs++; pic = Math.max(pic, actifs);
    await new Promise(res => setTimeout(res, 30));
    fs.writeFileSync(path.join(dossier, ticket.id + '.txt'), 'ok');
    actifs--;
    return { ok: true };
  };
  await boucleParallele({ charger, src, racine: r, base, runner, max: 2, capacite: () => 1, intervalleMs: 20 });
  assert.strictEqual(pic, 1);
});
