'use strict';
// EIA-001 (C2) : l'identité d'un agent est imposée par la garde (registre à usage unique), jamais par un argument.
// Un test par critère CA3 à CA10 (cas nominal et cas d'erreur) ; CA1/CA2 sont dans options.test.js, CA11 ici aussi.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const REEL = path.resolve(__dirname, '..', '..');
const MARQUEURS = ['SIEGE_CONTEXTE', 'CLAUDECODE', 'SIEGE_ROLE'];
for (const k of MARQUEURS) delete process.env[k];
const RACINE = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-id-')), PRIVE = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-idp-'));
process.env.SIEGE_RACINE = RACINE; process.env.SIEGE_PRIVE = PRIVE;
fs.mkdirSync(path.join(RACINE, 'droits')); fs.mkdirSync(path.join(RACINE, 'portfolio'));
fs.copyFileSync(path.join(REEL, 'droits', 'roles.json'), path.join(RACINE, 'droits', 'roles.json'));
fs.writeFileSync(path.join(RACINE, 'portfolio', 'features.json'), JSON.stringify({ version: 1, collection: 'features', elements: [{ id: 'EIA-001', titre: 'T', statut: 'En cours', filiale: 'Entreprise IA' }] }));
fs.writeFileSync(path.join(RACINE, 'portfolio', 'filiales.md'), '| Filiale | Préfixe | Dossier | Repo git | Statut |\n|---|---|---|---|---|\n| Entreprise IA | EIA | `p/siege` | p | Actif |\n');

const identite = require('../lib/identite'), garde = require('../lib/garde'), journal = require('../lib/journal');
const backlog = require('../backlog'), gh = require('../lib/github'), githubOutil = require('../github'), exception = require('../exception');
const P = identite.politique(RACINE), COMMENTAIRES = path.join(RACINE, 'portfolio', 'commentaires.json');
const lireJournal = () => { try { return fs.readFileSync(path.join(PRIVE, 'journal-garde.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
const commentaires = () => { try { return JSON.parse(fs.readFileSync(COMMENTAIRES, 'utf8'))['EIA-001'] || []; } catch { return []; } };
const vider = () => { fs.rmSync(path.join(PRIVE, 'identites'), { recursive: true, force: true }); fs.rmSync(COMMENTAIRES, { force: true }); fs.rmSync(path.join(PRIVE, 'journal-garde.jsonl'), { force: true }); };
const silence = async f => { const l = console.log; console.log = () => {}; try { return await f(); } finally { console.log = l; } };

// Appel « d'agent » : la garde dépose l'entrée (depot) puis l'outil s'exécute avec le marqueur de contexte
async function agent(role, outil, args, { depot = true, marqueur = { SIEGE_CONTEXTE: 'agent' } } = {}) {
  if (depot) { const m = identite.deposer(role, ['siege/' + outil + '.js', ...args]); if (m) throw new Error(m); }
  Object.assign(process.env, marqueur);
  try { return await silence(() => ({ backlog, github: githubOutil, exception })[outil].main(args)); }
  finally { for (const k of MARQUEURS) delete process.env[k]; }
}
const commenter = (role, ...a) => agent(role, 'backlog', ['commenter', 'EIA-001', ...a]);
const refus = (p, re) => assert.rejects(p, e => re.test(e.message));

test('CA3 le directeur ne parle pas pour le CEO ; nominal : son propre nom, ou nom omis', async () => {
  vider();
  await refus(commenter('directeur', '--auteur', 'CEO', '--texte', 'validé'), /auteur réservé aux humains : CEO/);
  assert.strictEqual(commentaires().length, 0);
  const l = lireJournal().filter(x => x.evenement === 'refus_identite');
  assert.deepStrictEqual([l[0].role, l[0].demande, l[0].outil, l[0].sous_commande], ['directeur', 'CEO', 'backlog', 'commenter']);
  await commenter('directeur', '--auteur', 'directeur', '--texte', 'a');
  await commenter('directeur', '--texte', 'b');
  assert.deepStrictEqual(commentaires().map(c => [c.auteur, c.type]), [['directeur', 'suivi'], ['directeur', 'suivi']]);
});

test('CA4 auteur différent du rôle refusé ; nominal ; valeur vide ou inconnue refusée', async () => {
  vider();
  await refus(commenter('product-owner', '--auteur', 'qa', '--texte', 'x'), /identité imposée par la garde : product-owner/);
  for (const v of ['', 'inconnu', 'product owner', 'product-owner2', 'xproduct-owner']) await assert.rejects(commenter('product-owner', '--auteur', v, '--texte', 'x'), /imposée/, JSON.stringify(v));
  assert.strictEqual(commentaires().length, 0);
  assert.ok(lireJournal().some(x => x.evenement === 'refus_identite' && x.role === 'product-owner' && x.demande === 'qa'));
  await commenter('product-owner', '--auteur', 'product-owner', '--texte', 'x');
  assert.strictEqual(commentaires()[0].auteur, 'product-owner');
});

test('CA5 auteur omis : le rôle imposé, pour chaque rôle de roles.json, jamais CEO', async () => {
  vider();
  for (const r of Object.keys(P.roles)) await commenter(r, '--texte', 'x');
  assert.deepStrictEqual(commentaires().map(c => c.auteur), Object.keys(P.roles));
  assert.ok(commentaires().every(c => c.type === 'suivi' && c.auteur !== 'CEO'));
});

test('CA6 casse et espaces : refus pour le directeur comme CA3 ; son propre nom accepté, enregistré en canonique', async () => {
  vider();
  for (const v of ['ceo ', 'Ceo', ' CEO', 'CEO\t', 'cEo']) await refus(commenter('directeur', '--auteur', v, '--texte', 'x'), /réservé aux humains/);
  for (const v of ['CЕO', 'ＣＥＯ', 'CEO\u00a0x', 'C\u200bEO']) await refus(commenter('directeur', '--auteur', v, '--texte', 'x'), /imposée/);
  assert.strictEqual(commentaires().length, 0);
  await commenter('qa', '--auteur', 'QA', '--texte', 'x'); await commenter('qa', '--auteur', ' qa ', '--texte', 'y');
  assert.deepStrictEqual(commentaires().map(c => c.auteur), ['qa', 'qa']);
});

test('CA7 question au CEO : auteur CEO refusé ; nominal, le ticket reste bloqué comme avant', async () => {
  vider();
  await refus(commenter('qa', '--question', '--auteur', 'CEO', '--texte', '?'), /réservé aux humains/);
  assert.strictEqual(commentaires().length, 0);
  await commenter('qa', '--question', '--texte', '?');
  await commenter('qa', '--question', '--auteur', 'qa', '--texte', '??');
  assert.deepStrictEqual(commentaires().map(c => [c.auteur, c.type]), [['qa', 'question'], ['qa', 'question']]);
  assert.ok(require('../lib/backlog').questionOuverte(commentaires()));
});

test('CA8 aucune voie vers « reponse » pour un agent ; le canal humain reste possible', async () => {
  vider();
  for (const role of ['qa', 'directeur']) {
    for (const extra of [['--type', 'reponse'], ['--reponse'], ['--auteur', 'CEO'], ['--inconnue', 'x']]) { try { await commenter(role, '--texte', 'x', ...extra); } catch {} }
  }
  assert.ok(commentaires().every(c => c.type !== 'reponse' && c.auteur !== 'CEO'));
  // canal humain (Siège web, Notion) : bibliothèque, sans marqueur d'agent
  const src = require('../lib/config').source('features');
  await src.commenter('EIA-001', { auteur: 'CEO', type: 'reponse', texte: 'oui' });
  assert.strictEqual(commentaires().at(-1).type, 'reponse');
  // liste figée des sous-commandes de backlog.js : une nouvelle sous-commande doit être revue pour ce risque
  const sous = [...fs.readFileSync(path.join(__dirname, '..', 'backlog.js'), 'utf8').matchAll(/case '([\w-]+)'/g)].map(m => m[1]);
  const ecrit = sous.filter(s => /reponse/.test(fs.readFileSync(path.join(__dirname, '..', 'backlog.js'), 'utf8').split(`case '${s}'`)[1]?.split('case \'')[0] || ''));
  assert.deepStrictEqual(ecrit, ['commenter'], 'seul commenter peut produire un type reponse (réservé à l\'humain)');
});

test('CA9 rôle GitHub : --role différent refusé ; omis ou égal, le jeton est celui du rôle imposé', async () => {
  vider();
  const sauve = { c: gh.config, r: gh.repoDeFiliale, j: gh.jetonRole, p: gh.pousser }, jetons = [];
  gh.config = () => ({}); gh.repoDeFiliale = (c, f) => ({ filiale: f[0], repo: 'o/r' }); gh.pousser = () => {};
  gh.jetonRole = async (c, p, role) => { jetons.push(role); return 'jeton'; };
  try {
    const a = ['pousser', '--filiale', 'EIA', '--branche', 'feature/EIA-001'];
    await refus(agent('dev-backend', 'github', [...a, '--role', 'reviewer']), /imposée/);
    assert.deepStrictEqual(jetons, [], 'aucun jeton émis');
    assert.ok(lireJournal().some(x => x.evenement === 'refus_identite' && x.role === 'dev-backend' && x.demande === 'reviewer' && x.outil === 'github'));
    await agent('dev-backend', 'github', a);
    await agent('dev-backend', 'github', [...a, '--role', 'dev-backend']);
    assert.deepStrictEqual(jetons, ['dev-backend', 'dev-backend']);
    await refus(agent('dev-backend', 'github', [...a, '--role', 'CEO']), /réservé aux humains/);
  } finally { gh.config = sauve.c; gh.repoDeFiliale = sauve.r; gh.jetonRole = sauve.j; gh.pousser = sauve.p; }
});

test('CA10 échec fermé : identité inconnue sans entrée valide, quel que soit le marqueur de contexte', async () => {
  const a = ['commenter', 'EIA-001', '--texte', 'x'];
  for (const m of [{ SIEGE_CONTEXTE: 'agent' }, { CLAUDECODE: '1' }, { SIEGE_ROLE: 'qa' }]) {
    vider(); await refus(agent('qa', 'backlog', a, { depot: false, marqueur: m }), /identité inconnue/); assert.strictEqual(commentaires().length, 0);
  }
  const f = mots => path.join(PRIVE, 'identites', identite.cleIdentite(['siege/backlog.js', ...mots]) + '.json'), depot = (mots, contenu) => { fs.mkdirSync(path.join(PRIVE, 'identites'), { recursive: true }); fs.writeFileSync(f(mots), contenu); };
  for (const [nom, contenu] of [['expirée', JSON.stringify({ role: 'qa', expire: Date.now() - 1 })], ['vide', ''], ['JSON invalide', '{'], ['sans rôle', JSON.stringify({ expire: Date.now() + 5e4 })],
    ['rôle non textuel', JSON.stringify({ role: 3, expire: Date.now() + 5e4 })], ['rôle inconnu', JSON.stringify({ role: 'pirate', expire: Date.now() + 5e4 })], ['expiration lointaine', JSON.stringify({ role: 'qa', expire: Date.now() + 9e6 })]]) {
    vider(); depot(a, contenu); await refus(agent('qa', 'backlog', a, { depot: false }), /identité inconnue/); assert.strictEqual(commentaires().length, 0, nom);
  }
  vider(); fs.mkdirSync(PRIVE, { recursive: true });                                    // dossier absent
  await refus(agent('qa', 'backlog', a, { depot: false }), /identité inconnue/);
  // nominal + usage unique : la première exécution consomme l'entrée, la seconde est refusée
  vider(); assert.strictEqual(identite.deposer('qa', ['siege/backlog.js', ...a]), null);
  await agent('qa', 'backlog', a, { depot: false });
  await refus(agent('qa', 'backlog', a, { depot: false }), /identité inconnue/);
  assert.strictEqual(commentaires().length, 1);
  // autre commande : clé différente, l'entrée de la commande « a » reste intacte
  vider(); identite.deposer('qa', ['siege/backlog.js', ...a]);
  await refus(agent('qa', 'backlog', ['commenter', 'EIA-001', '--texte', 'b'], { depot: false }), /identité inconnue/);
  assert.ok(fs.existsSync(f(a)));
});

test('CA10 garde : dépôt d\'une entrée par rôle, collision de clé, expiration et purge', () => {
  vider(); const mots = ['siege/backlog.js', 'commenter', 'EIA-001', '--texte', 'é à "ü" \\ 日本'], t = 1e6;
  assert.strictEqual(identite.deposer('qa', mots, { maintenant: t }), null);
  const f = path.join(PRIVE, 'identites', identite.cleIdentite(mots) + '.json');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { role: 'qa', expire: t + identite.DUREE_MS });
  assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
  assert.strictEqual(identite.deposer('qa', mots, { maintenant: t + 5 }), null, 'même rôle : entrée conservée');
  assert.match(identite.deposer('dev-backend', mots, { maintenant: t + 5 }), /autre rôle, réessaie/);
  assert.strictEqual(JSON.parse(fs.readFileSync(f, 'utf8')).role, 'qa', 'le premier garde son entrée');
  assert.strictEqual(identite.deposer('dev-backend', mots, { maintenant: t + identite.DUREE_MS + 1 }), null, 'entrée expirée : remplacée');
  assert.strictEqual(JSON.parse(fs.readFileSync(f, 'utf8')).role, 'dev-backend');
  for (let i = 0; i < 5; i++) identite.deposer('qa', ['siege/backlog.js', 'x' + i], { maintenant: 1 });
  identite.deposer('qa', ['siege/backlog.js', 'y'], { maintenant: t + identite.DUREE_MS * 3 });
  assert.strictEqual(fs.readdirSync(path.join(PRIVE, 'identites')).length, 1, 'seules les entrées expirées sont purgées');
});

test('CA10 dépôt : une entrée vide et récente (écriture en cours d\'un autre) n\'est jamais remplacée ; aucun temporaire ne reste', () => {
  vider(); const mots = ['siege/backlog.js', 'commenter', 'EIA-001', '--texte', 'course'], d = path.join(PRIVE, 'identites');
  fs.mkdirSync(d, { recursive: true }); const f = path.join(d, identite.cleIdentite(mots) + '.json'); fs.writeFileSync(f, '');
  assert.match(identite.deposer('dev-backend', mots), /illisible en cours.*réessaie/);
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '', 'entrée intacte');
  assert.deepStrictEqual(fs.readdirSync(d), [path.basename(f)], 'pas de temporaire laissé');
  const vieux = new Date(Date.now() - identite.DUREE_MS * 2); fs.utimesSync(f, vieux, vieux);
  assert.strictEqual(identite.deposer('dev-backend', mots), null, 'entrée illisible ancienne : remplacée');
  assert.strictEqual(JSON.parse(fs.readFileSync(f, 'utf8')).role, 'dev-backend');
  assert.deepStrictEqual(fs.readdirSync(d), [path.basename(f)]);
});

test('CA10 la garde et l\'outil calculent la même clé que l\'argv réel de bash -c (guillemets, antislash, accents, espaces)', () => {
  const { spawnSync } = require('child_process'), argv = c => { const r = spawnSync('bash', ['-c', c.replace(/^node siege\/backlog\.js/, `node -e 'console.log(JSON.stringify(process.argv.slice(1)))' siege/backlog.js`)], { encoding: 'utf8' }); return JSON.parse(r.stdout); };
  const litteraux = ['node siege/backlog.js commenter EIA-001 --texte "l\'agent dit \\"ok\\" é à ü"', 'node siege/backlog.js commenter EIA-001 --texte "chemin C:\\dossier\\x"',
    'node siege/backlog.js commenter   EIA-001   --texte   x', 'node siege/backlog.js commenter EIA-001 --texte \'a\\b\'', 'node siege/backlog.js commenter EIA-001 --texte a\\ b',
    'node siege/backlog.js commenter EIA-001 --texte "ligne1\nligne2"', 'node siege/backlog.js commenter EIA-001 --texte "日本 ü"'];
  for (const c of litteraux) {
    const segs = garde.outilsSiege(c); assert.strictEqual(segs.length, 1, c);
    assert.strictEqual(identite.cleIdentite(segs[0]), identite.cleIdentite(argv(c)), c);
  }
  // expansions du shell : la garde ne les évalue pas, la clé diffère de l'argv réel donc l'outil refuse (échec fermé)
  for (const c of ['node siege/backlog.js commenter EIA-001 --texte *', 'node siege/backlog.js commenter EIA-001 --texte {a,b}', 'node siege/backlog.js commenter EIA-001 --texte $HOME']) {
    const segs = garde.outilsSiege(c); if (!segs.length) continue;      // refusée d'emblée par la garde : fermé aussi
    assert.notStrictEqual(identite.cleIdentite(segs[0]), identite.cleIdentite(argv(c)), c);
  }
  const multi = 'node siege/backlog.js file && node siege/backlog.js questions';
  assert.strictEqual(garde.outilsSiege(multi).length, 2, 'une entrée par segment');
  assert.strictEqual(identite.cleIdentite(garde.outilsSiege('FOO=1 node siege/backlog.js commenter EIA-001 --texte x')[0]), identite.cleIdentite(['siege/backlog.js', 'commenter', 'EIA-001', '--texte', 'x']));
  assert.deepStrictEqual(garde.outilsSiege('ls && node autre.js x'), []);
  assert.deepStrictEqual(garde.outilsSiege('node siege/inconnu.js x'), []);
  assert.deepStrictEqual(garde.outilsSiege('echo $(id)'), []);
});

test('CA3/CA4 la garde refuse aussi (défense en profondeur) : auteur réservé, autre rôle, option répétée', () => {
  const d = (role, c) => garde.decider(P, { outil: 'Bash', entree: { command: c } }, { racine: REEL, role });
  assert.ok(!d('directeur', 'node siege/backlog.js commenter EIA-001 --auteur CEO --texte x').ok);
  assert.ok(!d('qa', 'node siege/backlog.js commenter EIA-001 --auteur qa --texte x --auteur CEO').ok);
  assert.ok(!d('product-owner', 'node siege/backlog.js commenter EIA-001 --auteur qa --texte x').ok);
  assert.ok(!d('dev-backend', 'node siege/github.js pr --role reviewer --branche feature/EIA-001').ok);
  assert.ok(d('qa', 'node siege/backlog.js commenter EIA-001 --texte x').ok, 'auteur omis permis (CA5)');
  assert.ok(d('qa', 'node siege/backlog.js commenter EIA-001 --auteur QA --texte x').ok);
  assert.ok(d('dev-backend', 'node siege/github.js pousser --filiale EIA --branche feature/EIA-001').ok);
  assert.ok(!d('qa', 'SIEGE_ROLE=CEO node siege/backlog.js file').ok, 'marqueur forgé');
  assert.ok(!d('qa', 'CLAUDECODE= node siege/backlog.js file').ok, 'marqueur vidé');
  assert.ok(!d('directeur', 'env SIEGE_PRIVE=/tmp/x node siege/backlog.js file').ok);
  for (const c of ['SIEGE_PRIVE=/tmp/x node siege/backlog.js file', 'SIEGE_RACINE=/tmp/x node siege/backlog.js file', 'FOO=1 CLAUDE_X=1 node siege/backlog.js file', 'SIEGE_CONTEXTE= node siege/backlog.js file']) {
    const r = d('qa', c); assert.ok(!r.ok, c); assert.match(r.raison, /Variable d'environnement interdite/, c);
  }
});

test('R4 noms réservés : liste de roles.json, CEO par défaut, rôle d\'agent nommé comme un humain refusé', () => {
  assert.deepStrictEqual(identite.humaines({ commun: { identites_humaines: ['CEO', 'Marie'] } }), ['CEO', 'Marie']);
  for (const l of [undefined, [], null, 'x', [3, null, '']]) assert.deepStrictEqual(identite.humaines({ commun: { identites_humaines: l } }), ['CEO'], JSON.stringify(l));
  assert.match(identite.refusDemande({ commun: { identites_humaines: ['CEO', 'Marie'] } }, 'qa', 'marie '), /réservé aux humains : Marie/);
  assert.deepStrictEqual(identite.rolesReserves({ commun: {}, roles: { qa: {}, 'ceo ': {} } }), ['ceo ']);
});

test('R7/R8 contexte sans entrée pour chaque outil ; humain hors contexte inchangé (CA11) ; journal sans texte de commentaire', async () => {
  vider();
  for (const [o, a] of [['exception', ['liste']], ['github', ['etat']], ['backlog', ['file']]]) await refus(agent('qa', o, a, { depot: false }), /identité inconnue/);
  await refus(agent('qa', 'exception', ['accorder', 'EXC-001'], { depot: true }), /Seul le CEO/);
  await refus(agent('qa', 'backlog', ['commenter', 'EIA-001', '--auteur', 'CEO\n{"role":"CEO"}', '--texte', 'secret'], {}), /réservé|imposée/);
  const l = lireJournal(); assert.ok(l.length >= 4);
  assert.ok(l.every(x => !JSON.stringify(x).includes('secret')), 'aucun texte de commentaire dans le journal');
  assert.ok(fs.readFileSync(path.join(PRIVE, 'journal-garde.jsonl'), 'utf8').trim().split('\n').every(x => { JSON.parse(x); return true; }), 'une ligne JSON valide par refus');
  // CA11 : humain hors contexte d'agent, comportement actuel ; entrées existantes intactes
  vider(); fs.writeFileSync(COMMENTAIRES, JSON.stringify({ 'EIA-001': [{ date: 'd', auteur: 'CEO', type: 'reponse', texte: 'ancien' }, { date: 'd', texte: 'sans type' }] }, null, 2));
  const avant = JSON.parse(fs.readFileSync(COMMENTAIRES, 'utf8'))['EIA-001'];
  await silence(() => backlog.main(['commenter', 'EIA-001', '--texte', 'x']));
  await silence(() => backlog.main(['commenter', 'EIA-001', '--auteur', 'qa', '--texte', 'y']));
  await silence(() => backlog.main(['commentaires', 'EIA-001'])); await silence(() => backlog.main(['questions'])); await silence(() => backlog.main(['file']));
  const apres = commentaires();
  assert.deepStrictEqual(apres.slice(0, 2), avant);
  assert.deepStrictEqual(apres.slice(2).map(c => [c.auteur, c.type]), [['CEO', 'reponse'], ['qa', 'suivi']]);
});

test('CA12 chaque critère CA1 à CA10 a un test nommé dans la suite', () => {
  const src = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
  for (let i = 1; i <= 10; i++) assert.ok(new RegExp(`test\\('CA${i}[ /]`).test(src), 'CA' + i);
});
