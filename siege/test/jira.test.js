'use strict';
// Jira Cloud et Data Center contre un faux Jira : initialisation, cycle de vie des tickets, commentaires, isolement.
const test = require('node:test'), assert = require('node:assert');
const { demarrer } = require('./faux-jira');
const jira = require('../lib/jira');
const { questionOuverte } = require('../lib/backlog');

const JETON = 'jira-jeton-de-test-0123456789';
const conf = (srv, mode) => ({ type: 'jira', url: 'http://127.0.0.1:' + srv.address().port, mode, email: 'ceo@exemple.fr', projet: 'PROJ', etiquette: 'bureau-ia', types: { features: 'Story', bugs: 'Bug' } });

for (const mode of ['cloud', 'dc']) test(`Jira ${mode} : init, tickets du Siège seulement, statut, commentaires, retrait sans suppression`, async () => {
  const srv = await demarrer({ mode });
  try {
    const r = await jira.initialiser(conf(srv, mode), JETON);
    assert.strictEqual(r.moi, 'Intégration Siège');
    assert.ok(r.crees.includes('Siège ID') && r.crees.includes('Siège Statut') && r.crees.includes('Siège Gravité'));
    assert.deepStrictEqual(r.avertissements, []);
    assert.strictEqual((await jira.initialiser(conf(srv, mode), JETON)).crees.length, 0, 'deuxième init : rien de recréé');

    const F = new jira.SourceJira({ config: r.config, jeton: JETON, collection: 'features' });
    const B = new jira.SourceJira({ config: r.config, jeton: JETON, collection: 'bugs' });
    // Les autres tableaux de l'entreprise : jamais vus par le Siège
    srv.etat.issues.push({ key: 'PROJ-90', fields: { summary: 'Story d\'une autre équipe', issuetype: { name: 'Story' }, labels: [] } });
    srv.etat.issues.push({ key: 'PROJ-91', fields: { summary: 'Créée à la main avec l\'étiquette', issuetype: { name: 'Story' }, labels: ['bureau-ia'] } });

    for (let k = 1; k <= 3; k++) await F.creer({ id: 'COL-00' + k, titre: 'Feature ' + k, rang: 4 - k, filiale: 'Collecte', dependances: k > 1 ? ['COL-001'] : [], description: 'Ligne 1\nLigne 2' });
    const c = await F.creer({ id: 'COL-004', titre: 'En cours dès la création', filiale: 'Collecte', statut: 'En cours' });
    assert.match(c.transition, /statut Jira : En cours/);
    await B.creer({ id: 'BUG-001', titre: 'Plante', filiale: 'Collecte', story: 'COL-001', gravite: 'Bloquant', reproduction: 'x'.repeat(400) });

    let l = await F.lister();
    assert.deepStrictEqual(l.map(e => e.id), ['COL-003', 'COL-002', 'COL-001', 'COL-004'], 'tri par rang, pagination, PROJ-90 et PROJ-91 écartées');
    assert.strictEqual(F.sansId, 1);
    assert.deepStrictEqual(l.find(e => e.id === 'COL-002').dependances, ['COL-001']);
    assert.strictEqual(l[0].jira.url, conf(srv, mode).url + '/browse/PROJ-3');
    assert.deepStrictEqual((await B.lister()).map(e => [e.id, e.gravite, e.reproduction.length]), [['BUG-001', 'Bloquant', 400]]);
    await assert.rejects(F.creer({ id: 'COL-001', titre: 'Doublon' }), /déjà utilisé/);

    const m = await F.modifier('COL-001', { statut: 'Livré', etape: '9 · Documentation', pr: 'moi/collecte#3' });
    assert.match(m.transition, /aucune transition Jira vers « livré »/, 'statut du Siège gardé même sans transition');
    const avecCorresp = new jira.SourceJira({ config: { ...r.config, statuts: { Livré: 'Terminé' } }, jeton: JETON, collection: 'features' });
    assert.match((await avecCorresp.modifier('COL-001', { statut: 'Livré' })).transition, /Terminé/);
    assert.strictEqual(srv.etat.issues.find(i => i.key === 'PROJ-1').fields.status.name, 'Terminé');
    l = await F.lister(); const e1 = l.find(e => e.id === 'COL-001');
    assert.deepStrictEqual([e1.statut, e1.etape, e1.pr], ['Livré', '9 · Documentation', 'moi/collecte#3']);

    // Question d'agent, réponse du CEO écrite directement dans Jira
    await F.commenter('COL-002', { auteur: 'qa', type: 'question', texte: 'Quel format de date ?' });
    await F.commenter('COL-002', { auteur: 'dev-backend', texte: 'Fait' });
    assert.ok(questionOuverte(await F.commentaires('COL-002')));
    srv.repondre('PROJ-2', 'ISO 8601');
    const fil = await F.commentaires('COL-002');
    assert.deepStrictEqual(fil.map(x => [x.auteur, x.type]), [['qa', 'question'], ['dev-backend', 'suivi'], ['CEO', 'reponse']]);
    assert.ok(!questionOuverte(fil));

    await F.supprimer('COL-004');
    assert.ok(srv.etat.issues.find(i => i.key === 'PROJ-4'), 'jamais supprimée dans Jira');
    assert.ok(!(await F.lister()).some(e => e.id === 'COL-004'));
  } finally { srv.close(); }
});

test('Jira : configuration, jeton et écrans vérifiés avec des messages clairs', async () => {
  assert.throws(() => jira.verifierConfig({ url: 'http://exemple.fr', mode: 'cloud' }), /https/);
  assert.throws(() => jira.verifierConfig({ url: 'https://x.atlassian.net', mode: 'cloud', email: 'pas-un-mail' }), /e-mail/);
  assert.throws(() => jira.verifierConfig({ url: 'https://x.atlassian.net', mode: 'dc', projet: 'PROJ', etiquette: 'bureau ia', types: {} }), /sans espace/);
  const srv = await demarrer({ mode: 'cloud', ecranManquant: ['Siège Étape'] });
  try {
    await assert.rejects(jira.initialiser(conf(srv, 'cloud'), 'mauvais-jeton-0123456789'), /Jira 401/);
    await assert.rejects(jira.initialiser({ ...conf(srv, 'cloud'), projet: 'AUTRE' }, JETON), /Projet introuvable/);
    await assert.rejects(jira.initialiser({ ...conf(srv, 'cloud'), types: { features: 'Epic', bugs: 'Bug' } }, JETON), /pas le type « Epic »/);
    const r = await jira.initialiser(conf(srv, 'cloud'), JETON);
    assert.match(r.avertissements.join('\n'), /Story : à ajouter aux écrans .* Siège Étape/);
    assert.throws(() => new jira.SourceJira({ config: conf(srv, 'cloud'), jeton: JETON, collection: 'features' }), /non initialisé/);
  } finally { srv.close(); }
});
