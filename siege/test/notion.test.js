'use strict';
// Intégration Notion de bout en bout contre un faux serveur : init des bases, import, CLI des agents, commentaires.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const { demarrer, JETON } = require('./faux-notion');
const { idDepuisLien } = require('../lib/notion');

test('idDepuisLien accepte une URL Notion ou un identifiant', () => {
  assert.strictEqual(idDepuisLien('https://www.notion.so/radhouen/Siege-1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6?pvs=4'), '1a2b3c4d-5e6f-47a8-b9c0-d1e2f3a4b5c6');
  assert.strictEqual(idDepuisLien('pas une url'), '');
});

test('l\'équipe initialise Notion, importe le backlog, fait vivre tickets et commentaires', async () => {
  const srv = await demarrer(), racine = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-n-')), prive = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-p-'));
  fs.mkdirSync(path.join(racine, 'portfolio'));
  fs.writeFileSync(path.join(racine, 'portfolio', 'filiales.md'), '| Filiale | Préfixe | Dossier |\n|---|---|---|\n| Collecte | COL | `c` |\n');
  fs.writeFileSync(path.join(racine, 'portfolio', 'features.json'), JSON.stringify({ elements: [
    { id: 'COL-001', titre: 'Faux serveur', rang: 1, filiale: 'Collecte', jalon: 'Jalon 0 · Fondations', statut: 'À faire', priorite: 'Haute', dependances: [] },
    { id: 'COL-002', titre: 'Scraper', rang: 2, filiale: 'Collecte', jalon: 'Jalon 1 · MVP', statut: 'À faire', priorite: 'Haute', dependances: ['COL-001'], description: 'x'.repeat(2500) }] }));
  Object.assign(process.env, { SIEGE_RACINE: racine, SIEGE_PRIVE: prive, NOTION_API_URL: 'http://127.0.0.1:' + srv.address().port, NOTION_TOKEN: JETON });
  for (const k of Object.keys(require.cache)) if (k.includes(path.sep + 'siege' + path.sep) && !k.includes('test')) delete require.cache[k];
  const { main } = require('../backlog'), cfg = require('../lib/config');
  const sortie = []; const log = console.log; console.log = (...a) => sortie.push(a.join(' '));
  try {
    await main(['notion-init', 'https://www.notion.so/Siege-1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6']);
    const s = cfg.lireSource();
    assert.strictEqual(s.type, 'notion'); assert.ok(s.bases.features && s.bases.bugs);
    const schemaF = srv.etat.bases.get(s.bases.features).properties;
    assert.ok(schemaF.Rang.number && schemaF.Statut.select.options.some(o => o.name === 'Livré') && schemaF.Filiale.select.options[0].name === 'Collecte');
    await assert.rejects(main(['notion-init', 'https://www.notion.so/1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6']), /déjà configuré/);

    await main(['importer']); await main(['importer']);          // deux fois : pas de doublon
    const f = await cfg.source('features').lister();
    assert.deepStrictEqual(f.map(e => e.id), ['COL-001', 'COL-002']);
    assert.strictEqual(f[1].description.length, 2500);           // texte long découpé en blocs puis recollé
    assert.deepStrictEqual(f[1].dependances, ['COL-001']);

    // Un agent fait avancer un ticket, commente, pose une question ; un testeur remonte un bug
    await main(['maj', 'COL-001', '--statut', 'En cours', '--etape', '4 · Développement', '--agent', 'dev-backend']);
    await main(['commenter', 'COL-001', '--auteur', 'dev-backend', '--texte', 'Faux serveur prêt, 6 scénarios']);
    await main(['commenter', 'COL-001', '--auteur', 'qa', '--question', '--texte', 'Faut-il simuler les 400 « NONE » ?']);
    await main(['creer', 'bug', '--filiale', 'Collecte', '--story', 'COL-001', '--titre', 'Retry-After ignoré', '--gravite', 'Bloquant', '--detecte-par', 'qa']);
    const { questionsOuvertes } = require('../backlog');
    assert.strictEqual((await questionsOuvertes())[0].question.texte, 'Faut-il simuler les 400 « NONE » ?');
    // Le CEO répond à la main dans Notion : la question est close
    const page = [...srv.etat.pages.values()].find(p => p.properties.ID.rich_text[0].text.content === 'COL-001');
    srv.commenterEnHumain(page.id, 'Oui, avec le corps {"key":"NONE"}');
    assert.strictEqual((await questionsOuvertes()).length, 0);

    sortie.length = 0; await main(['file']);
    assert.match(sortie.join('\n'), /1\. .*BUG-001.*Bloquant/);
    assert.match(sortie.join('\n'), /COL-002.*⟵ COL-001/);
    await main(['supprimer', 'BUG-001']);
    assert.strictEqual((await cfg.source('bugs').lister()).length, 0);
  } finally { console.log = log; srv.close(); }
});

test('jeton absent ou faux : erreurs explicites, jamais de repli silencieux', async () => {
  const srv = await demarrer();
  const { SourceNotion } = require('../lib/notion');
  process.env.NOTION_API_URL = 'http://127.0.0.1:' + srv.address().port;
  assert.throws(() => new SourceNotion({ jeton: '', base: '1a2b3c4d-5e6f-47a8-b9c0-d1e2f3a4b5c6', collection: 'features' }), /Jeton Notion manquant/);
  await assert.rejects(new SourceNotion({ jeton: 'ntn_faux', base: '1a2b3c4d-5e6f-47a8-b9c0-d1e2f3a4b5c6', collection: 'features' }).lister(), /Notion 401/);
  srv.close();
});
