'use strict';
// Mode autonome, lot 2 : lanceur d'instance (processus, durée max, mission courte)
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const { lancerClaude, mission, OUTILS } = require('../lib/lanceur');

function faux(corps) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'siege-faux-')), 'claude');
  fs.writeFileSync(f, '#!/bin/sh\n' + corps + '\n'); fs.chmodSync(f, 0o755);
  return f;
}

test('lanceur : la mission est courte, sans push ni fusion, outils restreints', () => {
  const m = mission({ id: 'EIA-001', titre: 'Titre' });
  assert.match(m, /Ticket : EIA-001/);
  assert.match(m, /Ne pousse pas, ne fusionne pas/);
  assert.ok(!OUTILS.some(o => /git|push|merge/i.test(o)), 'aucun outil git');
});

test('lanceur : instance réussie et instance en échec renvoient ok true / false sans lever', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-lanc-'));
  const ok = await lancerClaude({ dossier, ticket: { id: 'EIA-001', titre: 'x' }, bin: faux('echo fait') });
  assert.deepStrictEqual([ok.ok, ok.sortie.trim()], [true, 'fait']);
  const ko = await lancerClaude({ dossier, ticket: { id: 'EIA-001', titre: 'x' }, bin: faux('echo casse; exit 3') });
  assert.strictEqual(ko.ok, false);
});

test('lanceur : une instance qui dépasse la durée max est arrêtée', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-lanc-'));
  const r = await lancerClaude({ dossier, ticket: { id: 'EIA-001', titre: 'x' }, bin: faux('sleep 5'), dureeMax: 200 });
  assert.strictEqual(r.ok, false);
  assert.match(r.sortie, /durée max/);
});
