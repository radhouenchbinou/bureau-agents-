'use strict';
// Mode autonome, lot 8 : feux de relecture (verdict lu, échec fermé)
const test = require('node:test'), assert = require('node:assert');
const { revoir, verdict, mission } = require('../lib/revue');

test('verdict : OK seulement sur une ligne VERDICT: OK exacte, sinon échec', () => {
  assert.strictEqual(verdict('blabla\nVERDICT: OK\nrien'), 'success');
  assert.strictEqual(verdict('VERDICT: KO\nmotif'), 'failure');
  assert.strictEqual(verdict('VERDICT: OK pour moi'), 'failure', 'ligne non exacte : échec');
  assert.strictEqual(verdict(''), 'failure');
  assert.strictEqual(verdict('VERDICT: OK\nVERDICT: KO'), 'failure', 'dernier verdict pris');
});

test('revoir : un feu par rôle, échec de l\'agent = feu rouge', async () => {
  const roles = [];
  const lancer = async ({ role }) => { roles.push(role); if (role === 'rssi-devsecops') throw new Error('expiré'); return { ok: true, sortie: 'VERDICT: OK' }; };
  const r = await revoir({ lancer, dossier: '/x', ticket: { id: 'EIA-001' } });
  assert.deepStrictEqual(roles, ['reviewer', 'rssi-devsecops']);
  assert.deepStrictEqual(r, { revue: 'success', securite: 'failure' });
});

test('mission : courte, sans modification ni push', () => {
  assert.match(mission('reviewer', { id: 'EIA-001' }), /Ne modifie rien, ne pousse rien/);
});
