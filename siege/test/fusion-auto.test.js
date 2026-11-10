'use strict';
// Mode autonome, lot 4 : décision de fusion automatique (seuil 90 %, feux revue et sécurité verts, criticité fixe exclue)
const test = require('node:test'), assert = require('node:assert');
const { peutFusionner, fusionnerSiPret } = require('../lib/fusion-auto');
const vert = { revue: 'success', securite: 'success' };

test('fusion : seulement si criticité ≤ 90 %, non fixe, et les deux feux verts', () => {
  assert.strictEqual(peutFusionner({ criticite: { taux: 20, fixe: false, motif: 'base' }, feux: vert }).ok, true);
  assert.strictEqual(peutFusionner({ criticite: { taux: 90, fixe: false, motif: 'b' }, feux: vert }).ok, true, 'à 90 % pile, fusion');
  assert.strictEqual(peutFusionner({ criticite: { taux: 91, fixe: false, motif: 'b' }, feux: vert }).ok, false);
  assert.strictEqual(peutFusionner({ criticite: { taux: 100, fixe: true, motif: 'garde' }, feux: vert }).ok, false, 'fichier critique jamais fusionné');
  assert.strictEqual(peutFusionner({ criticite: { taux: 20, fixe: false }, feux: { revue: 'failure', securite: 'success' } }).ok, false);
  assert.strictEqual(peutFusionner({ criticite: { taux: 20, fixe: false }, feux: { revue: 'success' } }).ok, false, 'feu sécurité absent');
  assert.strictEqual(peutFusionner({ criticite: { taux: 20, fixe: false }, feux: null }).ok, false);
});

test('fusion : fusionner() n\'est appelé que sur décision positive', async () => {
  let appels = 0;
  const f = async () => { appels++; };
  const ko = await fusionnerSiPret({ criticite: { taux: 95, fixe: false, motif: 'x' }, feux: vert, fusionner: f });
  assert.strictEqual(ko.fusionne, false);
  assert.strictEqual(appels, 0);
  const ok = await fusionnerSiPret({ criticite: { taux: 10, fixe: false, motif: 'x' }, feux: vert, fusionner: f });
  assert.strictEqual(ok.fusionne, true);
  assert.strictEqual(appels, 1);
});
