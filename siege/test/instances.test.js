'use strict';
// Registre des instances : ouverture, clôture, reprise après arrêt, regroupement par modèle
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const { Registre, grouper } = require('../lib/instances');

test('registre : ouvrir, clore, reprendre après arrêt, regrouper par moteur et modèle', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'siege-inst-')), 'instances.json');
  const r = new Registre(f);
  const a = r.ouvrir({ role: 'dev-backend', ticket: 'EIA-001', modele: 'opus' });
  const b = r.ouvrir({ role: 'reviewer', ticket: 'EIA-001', modele: 'sonnet' });
  r.clore(a, { ok: true });
  assert.strictEqual(r.lire().find(e => e.id === a).etat, 'terminée');
  assert.strictEqual(r.reprendre(), 1, 'b était en cours : interrompue');
  assert.strictEqual(r.lire().find(e => e.id === b).etat, 'interrompue');
  const groupes = grouper(r.lire());
  assert.deepStrictEqual(groupes.map(g => g.modele).sort(), ['claude · opus', 'claude · sonnet']);
});

test('registre : fichier absent ou illisible → liste vide, pas d\'exception', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'siege-inst-')), 'absent.json');
  assert.deepStrictEqual(new Registre(f).lire(), []);
  fs.writeFileSync(f, '{pas du json');
  assert.deepStrictEqual(new Registre(f).lire(), []);
});
