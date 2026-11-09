'use strict';
// R1, CA1, CA2 : une option répétée est refusée par le parseur commun, avant toute action.
const test = require('node:test'), assert = require('node:assert');
const { options, ErreurOptions, ErreurSiege } = require('../lib/options');

test('CA1 option répétée : refusée quelle que soit la valeur, au début, au milieu ou à la fin', () => {
  assert.throws(() => options(['commenter', 'EIA-001', '--auteur', 'qa', '--texte', 'x', '--auteur', 'CEO']), e => e instanceof ErreurOptions && /option répétée : --auteur/.test(e.message));
  assert.throws(() => options(['--auteur', 'qa', '--auteur', 'qa']), /option répétée : --auteur/, 'même valeur : refusée aussi');
  assert.throws(() => options(['--auteur', 'a', 'X', '--auteur', 'b']), /--auteur/);
  assert.ok(new ErreurOptions('x') instanceof ErreurSiege);
});

test('CA1 nominal : une occurrence de chaque option', () => {
  const { o, reste } = options(['commenter', 'EIA-001', '--auteur', 'qa', '--texte', 'x', '--question']);
  assert.deepStrictEqual([{ ...o }, reste], [{ auteur: 'qa', texte: 'x', question: '' }, ['commenter', 'EIA-001']]);
});

test('CA2 autre option, booléen, formes équivalentes --a-b et --a_b', () => {
  assert.throws(() => options(['--texte', 'a', '--texte', 'b', '--auteur', 'qa']), /option répétée : --texte/);
  assert.throws(() => options(['--question', '--question']), /--question/);
  assert.throws(() => options(['--detecte-par', 'a', '--detecte_par', 'b']), /option répétée/);
  assert.throws(() => options(['--role', 'dev-backend', '--role', 'reviewer']), /option répétée : --role/);
  assert.strictEqual(options(['--detecte-par', 'qa']).o.detecte_par, 'qa');
});

test('R1 une valeur n\'est pas une option ; valeur vide si suivie d\'une option', () => {
  const { o } = options(['--texte', 'a --auteur CEO', '--auteur', 'qa']);
  assert.deepStrictEqual([o.texte, o.auteur], ['a --auteur CEO', 'qa']);
  assert.deepStrictEqual({ ...options(['--auteur', '--texte', 'x']).o }, { auteur: '', texte: 'x' });
});

test('G1 forme --option=valeur : refusée explicitement, jamais d\'écrasement silencieux', () => {
  assert.throws(() => options(['--auteur=qa', '--auteur', 'CEO']), /--option=valeur non supportée/);
  assert.throws(() => options(['--auteur=qa']), ErreurOptions);
});

test('CA2 les cinq outils utilisent le parseur commun (option répétée refusée avant toute action)', async () => {
  const outils = { backlog: ['file', '--x', '1', '--x', '2'], github: ['etat', '--x', '1', '--x', '2'], exception: ['liste', '--x', '1', '--x', '2'],
    agent: ['moteurs', '--x', '1', '--x', '2'], demande: ['liste', '--x', '1', '--x', '2'], filiale: ['liste', '--x', '1', '--x', '2'] };
  for (const k of ['SIEGE_CONTEXTE', 'CLAUDECODE', 'SIEGE_ROLE']) delete process.env[k];
  for (const [nom, args] of Object.entries(outils))
    await assert.rejects(async () => require('../' + nom).main(args), e => e instanceof ErreurOptions && /option répétée : --x/.test(e.message), nom);
});
