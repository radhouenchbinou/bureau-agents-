'use strict';
// Livraison groupée d'une feature multi-filiales : ordre des fusions, tout ou rien, arrêt net sur échec.
const test = require('node:test'), assert = require('node:assert');
const { lot, livrer, lirePr } = require('../lib/livraison');
const { valider } = require('../lib/backlog');
const { demarrer, JETON } = require('./faux-notion');
const { SourceNotion, ClientNotion } = require('../lib/notion');

const F = [
  { id: 'GRP-003', titre: 'Export partagé', filiale: 'Groupe', rang: 1, dependances: [] },
  { id: 'PIL-004', titre: 'Écran', filiale: 'Pilotage', rang: 1, parent: 'GRP-003', dependances: ['DON-002'], pr: 'moi/pilotage#9' },
  { id: 'DON-002', titre: 'Import', filiale: 'Données', rang: 5, parent: 'GRP-003', dependances: ['COL-007'], pr: 'moi/donnees#4' },
  { id: 'COL-007', titre: 'Export', filiale: 'Collecte', rang: 9, parent: 'GRP-003', dependances: [], pr: 'moi/collecte#12' },
  { id: 'COL-008', titre: 'Autre', filiale: 'Collecte', rang: 2, dependances: [] }];

test('champs Parent et PR validés', () => {
  assert.deepStrictEqual(valider('features', { parent: 'GRP-003', pr: 'moi/repo.x#12' }), { parent: 'GRP-003', pr: 'moi/repo.x#12' });
  assert.throws(() => valider('features', { pr: 'https://github.com/moi/x/pull/1' }), /PR invalide/);
  assert.deepStrictEqual(lirePr('moi/collecte#12'), { repo: 'moi/collecte', numero: 12 });
});

test('lot : producteur avant consommateurs, PR manquante signalée, lot vide refusé', () => {
  const l = lot(F, 'GRP-003');
  assert.deepStrictEqual(l.membres.map(m => m.id), ['COL-007', 'DON-002', 'PIL-004']);
  assert.deepStrictEqual(l.manque, []);
  assert.deepStrictEqual(lot(F.map(f => f.id === 'DON-002' ? { ...f, pr: '' } : f), 'GRP-003').manque, ['DON-002 (Données) sans PR']);
  assert.throws(() => lot(F, 'COL-008'), /pas de lot/);
  assert.throws(() => lot(F, 'PIL-004'), /enfant de GRP-003/);
  assert.throws(() => lot(F.map(f => f.id === 'COL-007' ? { ...f, dependances: ['PIL-004'] } : f), 'GRP-003'), /circulaires/);
});

test('livrer : rien n\'est fusionné si une seule PR n\'est pas prête ; arrêt net sur échec de fusion', async () => {
  const l = lot(F, 'GRP-003'), fusions = [];
  let r = await livrer(l, { verifier: async m => ({ manque: m.id === 'PIL-004' ? ['approbation du CEO sur la PR'] : [] }), fusionner: async m => fusions.push(m.id) });
  assert.strictEqual(r.ok, false); assert.deepStrictEqual(fusions, []);
  assert.deepStrictEqual(r.manques, ['PIL-004 moi/pilotage#9 : approbation du CEO sur la PR']);
  r = await livrer(l, { verifier: async () => ({ manque: [] }), fusionner: async m => { if (m.id === 'DON-002') throw new Error('GitHub 409 : Head branch was modified'); fusions.push(m.id); } });
  assert.deepStrictEqual([r.phase, r.fusionnees, r.echec.id, r.restantes], ['fusion', ['COL-007'], 'DON-002', ['PIL-004']]);
  fusions.length = 0;
  r = await livrer(l, { verifier: async () => ({ manque: [] }), fusionner: async m => fusions.push(m.id) });
  assert.deepStrictEqual([r.ok, fusions], [true, ['COL-007', 'DON-002', 'PIL-004']]);
});

test('Notion : une base créée avant les champs Parent et PR les reçoit à la première écriture', async () => {
  const srv = await demarrer(); process.env.NOTION_API_URL = 'http://127.0.0.1:' + srv.address().port;
  try {
    const c = new ClientNotion(JETON);
    const d = await c.appel('POST', '/databases', { parent: { page_id: 'x' }, properties: { ID: { rich_text: {} }, Titre: { title: {} }, Rang: { number: {} } } });
    const s = new SourceNotion({ jeton: JETON, base: d.id, collection: 'features' });
    await s.creer({ id: 'GRP-003', titre: 'Export', parent: '' });
    const props = srv.etat.bases.get(d.id).properties;
    assert.ok(props.Parent && props.PR && props['Dépend de']);
    assert.strictEqual(srv.etat.appels.filter(a => a.startsWith('PATCH /databases')).length, 1);
    await s.modifier('GRP-003', { statut: 'En cours' });
    assert.strictEqual(srv.etat.appels.filter(a => a.startsWith('PATCH /databases')).length, 1, 'une seule mise à niveau');
  } finally { srv.close(); }
});

test('un enfant qui dépend de son parent démarre quand la conception du parent est validée, pas sa livraison', () => {
  const { prete } = require('../lib/backlog');
  const P = { id: 'GRP-002', statut: 'En cours', etape: '2 · Conception', dependances: [] };
  const E = { id: 'RES-004', parent: 'GRP-002', dependances: ['GRP-002'] }, A = { id: 'COL-009', dependances: ['GRP-002'] };
  assert.strictEqual(prete(E, [P, E]), false);
  const P8 = { ...P, etape: '8 · Livraison' };
  assert.strictEqual(prete(E, [P8, E]), true);
  assert.strictEqual(prete(A, [P8, A]), false, 'un ticket qui n\'est pas son enfant attend la livraison');
});
