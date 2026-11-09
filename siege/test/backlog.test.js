'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const { valider, file, reclasser, prochainId, SourceFichier, questionOuverte, depuisLigne, enLigne } = require('../lib/backlog');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'siege-'));

test('validation : identifiants, choix, rang, dépendances', () => {
  assert.throws(() => valider('features', { id: 'col-1', titre: 'x' }, { strict: true }), /au format COL-001/);
  assert.throws(() => valider('bugs', { id: 'COL-001', titre: 'x' }, { strict: true }), /BUG-001/);
  assert.throws(() => valider('features', { statut: 'Fini' }), /Statut/);
  assert.throws(() => valider('features', { rang: 0 }), /Rang/);
  assert.throws(() => valider('features', { dependances: 'COL-1' }), /Dépend/);
  const v = valider('features', { id: 'COL-001', titre: '  T  ', dependances: 'GRP-001, GRP-001 COL-002' }, { strict: true });
  assert.deepStrictEqual([v.titre, v.statut, v.priorite, v.dependances], ['T', 'À faire', 'Moyenne', ['GRP-001', 'COL-002']]);
  assert.strictEqual(valider('bugs', { id: 'BUG-001', titre: 'b' }, { strict: true }).gravite, 'Majeur');
});

test('file de travail : bugs bloquants, puis features prêtes par rang, puis autres bugs ; attente des dépendances', () => {
  const f = [
    { id: 'COL-002', rang: 1, statut: 'À faire', dependances: ['COL-001'] },
    { id: 'COL-001', rang: 2, statut: 'Livré', dependances: [] },
    { id: 'PIL-001', rang: 3, statut: 'En cours', dependances: ['COL-005'] },
    { id: 'COL-003', rang: null, statut: 'À faire', dependances: [] }
  ];
  const b = [{ id: 'BUG-002', rang: 5, gravite: 'Mineur', statut: 'Ouvert' }, { id: 'BUG-001', rang: 9, gravite: 'Bloquant', statut: 'Ouvert' }, { id: 'BUG-003', gravite: 'Bloquant', statut: 'Fermé' }];
  const r = file(f, b);
  assert.deepStrictEqual(r.ordre.map(x => x.id), ['BUG-001', 'COL-002', 'COL-003', 'BUG-002']);
  assert.deepStrictEqual(r.enAttente.map(x => x.id), ['PIL-001']);
});

test('reclasser ne renvoie que les rangs qui changent', () => {
  assert.deepStrictEqual(reclasser([{ id: 'A-1', rang: 1 }, { id: 'B', rang: 2 }, { id: 'C', rang: 3 }], ['A-1', 'C', 'B']), [{ id: 'B', rang: 3 }, { id: 'C', rang: 2 }]);
});

test('prochain identifiant par filiale ou BUG', () => {
  assert.strictEqual(prochainId('features', [{ id: 'COL-002' }, { id: 'PIL-007' }], 'COL'), 'COL-003');
  assert.strictEqual(prochainId('bugs', [], 'COL'), 'BUG-001');
});

test('source fichier : créer, modifier, supprimer, commentaires, écritures concurrentes', async () => {
  const d = tmp(), s = new SourceFichier('features', path.join(d, 'features.json'));
  await Promise.all([1, 2, 3].map(i => s.creer({ id: 'COL-00' + i, titre: 'T' + i, rang: i })));
  assert.strictEqual((await s.lister()).length, 3);
  await assert.rejects(s.creer({ id: 'COL-001', titre: 'x' }), /déjà/);
  const m = await s.modifier('COL-002', { statut: 'En cours', etape: '4 · Développement' });
  assert.strictEqual(m.statut, 'En cours');
  await s.supprimer('COL-003');
  assert.deepStrictEqual((await s.lister()).map(e => e.id), ['COL-001', 'COL-002']);
  await s.commenter('COL-001', { auteur: 'qa', type: 'question', texte: 'Arrondi au centime ?' });
  assert.strictEqual(questionOuverte(await s.commentaires('COL-001')).texte, 'Arrondi au centime ?');
  await s.commenter('COL-001', { auteur: 'CEO', type: 'reponse', texte: 'Oui' });
  assert.strictEqual(questionOuverte(await s.commentaires('COL-001')), null);
  await assert.rejects(s.commenter('COL-009', { texte: 'x' }), /introuvable/);
});

test('format des commentaires Notion : aller-retour et réponse humaine', () => {
  const c = { auteur: 'dev-backend', type: 'suivi', texte: 'Tests verts' };
  assert.deepStrictEqual(depuisLigne(enLigne(c)), { date: '', ...c });
  assert.deepStrictEqual(depuisLigne('ok pour moi', { humain: true }), { date: '', auteur: 'CEO', type: 'reponse', texte: 'ok pour moi' });
});
