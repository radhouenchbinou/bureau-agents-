'use strict';
// Étapes du circuit désactivées par ticket : calcul de l'étape suivante, validation et refus de la garde.
const test = require('node:test'), assert = require('node:assert');
const { etapeSuivante, etapesDesactivees, etapeDesactivee, numeroEtape, valider, ErreurBacklog } = require('../lib/backlog');
const garde = require('../lib/garde');

test('étape suivante : les étapes désactivées sont sautées', () => {
  const t = { etapes_desactivees: [3, 5] };
  assert.deepStrictEqual(etapeSuivante(t, 2), { n: 4, nom: '4 · Développement' });
  assert.strictEqual(etapeSuivante(t, 4).n, 6);
  assert.strictEqual(etapeSuivante(t, 6).n, 7);
  assert.strictEqual(etapeSuivante({}, 8).n, 9);
  assert.strictEqual(etapeSuivante(t, 9), null, 'après la dernière, plus rien');
});

test('numéro d\'étape lu depuis son libellé, et désactivations normalisées', () => {
  assert.strictEqual(numeroEtape('4 · Développement'), 4);
  assert.strictEqual(numeroEtape(''), null);
  assert.deepStrictEqual(etapesDesactivees({ etapes_desactivees: ['3', 0, 12, 'x'] }), [3, 0].filter(n => n >= 1));
  assert.ok(etapeDesactivee({ etapes_desactivees: [5] }, 5));
  assert.ok(!etapeDesactivee({ etapes_desactivees: [5] }, 4));
});

test('validation : l\'étape 0 (cadrage) ne peut pas être désactivée, les autres oui', () => {
  assert.throws(() => valider('features', { etapes_desactivees: ['0'] }), ErreurBacklog);
  assert.throws(() => valider('features', { etapes_desactivees: ['10'] }), ErreurBacklog);
  assert.deepStrictEqual(valider('features', { etapes_desactivees: '3, 5' }).etapes_desactivees, ['3', '5']);
});

test('garde : une mission sur une étape désactivée est refusée, les autres passent', () => {
  const liaisons = {}, desactive = (ticket, etape) => ticket === 'COL-002' && etape === 5;
  const m = p => ({ prompt: p });
  const refus = garde.verifierMission(liaisons, 's1', m('Ticket : COL-002\nÉtape : 5 · Recette'), desactive);
  assert.strictEqual(refus.ok, false);
  assert.match(refus.raison, /désactivée/);
  assert.strictEqual(garde.verifierMission(liaisons, 's1', m('Ticket : COL-002\nÉtape : 4 · Développement'), desactive).ok, true);
  assert.strictEqual(garde.verifierMission(liaisons, 's2', m('Ticket : COL-003\nÉtape : 5 · Recette'), desactive).ok, true);
});
