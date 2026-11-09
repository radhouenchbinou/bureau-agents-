'use strict';
// C6 : le feu de revue porte sur le commit relu ; refus si la tête de la PR a bougé depuis la revue
const test = require('node:test'), assert = require('node:assert');
const { verifierTeteRelue } = require('../github');
const RELU = 'a'.repeat(40), NOUVEAU = 'b'.repeat(40);

test('C6 : feu accepté si la tête de la PR est le commit relu', () => {
  assert.doesNotThrow(() => verifierTeteRelue({ head: { sha: RELU } }, RELU, 7));
});

test('C6 : feu refusé si un push a bougé la tête entre la revue et le feu', () => {
  assert.throws(() => verifierTeteRelue({ head: { sha: NOUVEAU } }, RELU, 7), /a bougé.*relecture nécessaire/);
});
