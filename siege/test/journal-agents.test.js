'use strict';
// EIA-017 · Journal de logs par agent : module (lib/journal-agents.js), branchements (garde, exceptions, agent.js,
// lancerClaude, serveur) et protection d'écriture. Chaque test travaille dans un SIEGE_PRIVE temporaire.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { spawnSync, spawn } = require('child_process');
const R = path.resolve(__dirname, '..', '..');
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));
process.env.SIEGE_PRIVE = tmp('siege-j-');
const J = require('../lib/journal-agents');
const neuf = () => { process.env.SIEGE_PRIVE = tmp('siege-j-'); delete process.env.SIEGE_RACINE; return process.env.SIEGE_PRIVE; };
const brut = role => { try { return fs.readFileSync(J.FICHIER(role), 'utf8'); } catch { return ''; } };
const base = (o = {}) => ({ role: 'dev-backend', filiale: 'Entreprise IA', ticket: 'EIA-017', etape: '4 · Développement', moteur: 'claude', modele: 'm1', ...o });
const FAUX = 'ghp_' + 'ABCDEF0123456789ABCDEF0123456789ABCD';

// ---------- Module : cas nominaux ----------
test('CA1/CA2 : une exécution réussie, puis une exécution en cours', () => {
  neuf();
  const id = J.ouvrir(base({ debut: '2026-11-09T10:00:00.000Z' }));
  let e = J.lire('dev-backend').entrees[0];
  assert.deepStrictEqual([e.id, e.etat, e.fin, e.code], [id, 'en cours', undefined, undefined]);
  J.clore('dev-backend', id, { fin: '2026-11-09T10:02:05.000Z', code: 0, sortie: 'Passation · Fait' });
  e = J.lire('dev-backend').entrees[0];
  assert.deepStrictEqual([e.role, e.filiale, e.ticket, e.etape, e.moteur, e.modele, e.debut, e.fin, e.duree, e.etat, e.code],
    ['dev-backend', 'Entreprise IA', 'EIA-017', '4 · Développement', 'claude', 'm1', '2026-11-09T10:00:00.000Z', '2026-11-09T10:02:05.000Z', 125, 'terminé', 0]);
  assert.strictEqual(e.extrait, 'Passation · Fait');
});

test('CA4/CA5/L1/L2 : échec avec sortie, bornage à 2 000 caractères, sorties vides', () => {
  neuf();
  const a = J.ouvrir(base()), b = J.ouvrir(base()), c = J.ouvrir(base());
  J.clore('dev-backend', a, { code: 1, sortie: 'x'.repeat(300) });
  J.clore('dev-backend', b, { code: 1, sortie: 'a'.repeat(3000) + 'FIN' });
  J.clore('dev-backend', c, { code: 0, sortie: null });
  const par = Object.fromEntries(J.lire('dev-backend').entrees.map(e => [e.id, e]));
  assert.deepStrictEqual([par[a].etat, par[a].extrait.length, par[a].tronque], ['échec', 300, false]);
  assert.ok(par[b].extrait.length <= 2000 && par[b].extrait.endsWith('[tronqué]') && par[b].tronque && par[b].extrait.includes('FIN'));
  assert.deepStrictEqual([par[c].extrait, par[c].tronque], ['', false]);
  for (const [n, tronque] of [[1999, false], [2000, false], [2001, true]]) {
    const x = J.borner('y'.repeat(n)); assert.strictEqual(x.tronque, tronque, String(n)); assert.ok(x.extrait.length <= 2000);
  }
  assert.doesNotThrow(() => { J.borner(undefined); J.borner(''); });
});

test('CA8/CA9/L6/L7/L8/L10 : masquage à l\'écriture, avant bornage, sur tous les champs', () => {
  neuf();
  const sortie = 'x'.repeat(1990) + FAUX + 'y'.repeat(3000) + '\nAuthorization: Bearer abc123\n';
  const id = J.ouvrir(base({ etape: 'étape ' + FAUX, modele: 'sk-' + 'a'.repeat(30), filiale: 'token=zzzzzzzz' }));
  J.evenement('dev-backend', id, { nature: 'refus', outil: 'Bash', motif: 'curl -H "Authorization: Bearer abc123" https://x', raison: 'jeton ' + FAUX });
  J.clore('dev-backend', id, { code: 1, sortie });
  const t = brut('dev-backend');
  for (const interdit of [FAUX, 'ghp_ABC', 'abc123', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'zzzzzzzz']) assert.ok(!t.includes(interdit), interdit);
  assert.ok(t.includes('[MASQUÉ]') && t.includes('Authorization: [MASQUÉ]'));
  // Secret loin de la fin (zone des 16 000 derniers caractères) masqué aussi
  assert.ok(!J.borner('z'.repeat(15000) + FAUX + 'q'.repeat(100)).extrait.includes('ghp_'));
  const m = [
    'github_pat_' + 'A'.repeat(30), 'ghs_' + 'B'.repeat(30), 'sk-ant-' + 'c'.repeat(30), 'xoxb-1234567890-abc', '123456789:' + 'a'.repeat(35), 'ntn_' + 'd'.repeat(32),
    '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\nMIIabc sans fin',
    'Proxy-Authorization: Basic dXNlcjpwdw==', 'API_KEY=motdepasse1', '{"password": "hunter22"}', 'curl --token xyz123abc'];
  for (const s of m) { const r = J.masquer('avant ' + s + ' après'); assert.ok(r.includes('[MASQUÉ]'), s); }
  assert.ok(J.masquer('API_KEY=motdepasse1').startsWith('API_KEY='), 'le nom de variable est gardé');
  for (const s of ['key', 'sk-court', '1234567']) assert.strictEqual(J.masquer(s), s);
  process.env.SIEGE_TEST_TOKEN = 'valeur-secrete-12345';
  try { assert.strictEqual(J.masquer('j\'ai vu valeur-secrete-12345 ici'), 'j\'ai vu [MASQUÉ] ici'); } finally { delete process.env.SIEGE_TEST_TOKEN; }
});

test('L11/L12/L28 : UTF-8, caractères de contrôle, champs bornés, ligne < 8 Ko', () => {
  neuf();
  const id = J.ouvrir(base({ filiale: 'Société générale' }));
  J.evenement('dev-backend', id, { nature: 'refus', motif: 'm'.repeat(10000), raison: 'r'.repeat(10000) });
  J.clore('dev-backend', id, { code: 1, sortie: 'خطأ في الاتصال 😀\u0000\u001b[31m\r\nligne\tok' });
  const e = J.lire('dev-backend').entrees[0];
  assert.strictEqual(e.filiale, 'Société générale');
  assert.ok(e.extrait.includes('خطأ في الاتصال 😀') && !/[\u0000\u001b\r]/.test(e.extrait) && e.extrait.includes('\n') && e.extrait.includes('\t'));
  assert.ok(e.evenements[0].motif.length <= 300 && e.evenements[0].raison.length <= 300);
  for (const l of brut('dev-backend').split('\n').filter(Boolean)) { assert.ok(l.length < 8192); JSON.parse(l); }
  const dur = J.borner('😀'.repeat(3000)).extrait; assert.ok(!/[\ud800-\udbff]$/.test(dur.replace('\n[tronqué]', '')) && !/^[\udc00-\udfff]/.test(dur));
});

test('L13/L14 : rôle et ticket invalides', () => {
  const p = neuf();
  for (const r of ['../../etc/x', 'Dev', 'a', '', 'dev backend', 'x'.repeat(60)]) { assert.strictEqual(J.ouvrir(base({ role: r })), null, r); assert.deepStrictEqual(J.lire(r).entrees, []); }
  assert.ok(!fs.existsSync(path.join(p, 'journaux')) || fs.readdirSync(path.join(p, 'journaux', 'agents')).length === 0);
  for (const t of ['eia-17', 'EIA-17', 'X']) { J.ouvrir(base({ ticket: t })); }
  assert.ok(J.lire('dev-backend').entrees.every(e => e.ticket === ''));
});

test('L15-L19 : doublons, ordre des lignes, lignes illisibles, version inconnue, entrée sans ticket', () => {
  const p = neuf();
  const id = J.ouvrir(base({ id: 'id-unique-0001' })); assert.strictEqual(id, 'id-unique-0001');
  J.ouvrir(base({ id: 'id-unique-0001', ticket: 'EIA-018' }));
  assert.strictEqual(J.lire('dev-backend').total, 1);
  assert.strictEqual(J.lire('dev-backend').entrees[0].ticket, 'EIA-017', 'la première gagne');
  // clôture / évènement sur id inconnu : ignorés sans erreur
  assert.strictEqual(J.clore('dev-backend', 'id-inconnu-0002', { code: 0 }), true);
  J.evenement('dev-backend', 'id-inconnu-0002', { nature: 'refus', motif: 'x' });
  assert.strictEqual(J.lire('dev-backend').total, 1);
  // la clôture réelle l'emporte sur « interrompu » ; sinon la première gagne
  J.clore('dev-backend', id, { etat: 'interrompu', code: null });
  J.clore('dev-backend', id, { code: 0, sortie: 'réel' });
  J.clore('dev-backend', id, { code: 1, sortie: 'deuxième' });
  let e = J.lire('dev-backend').entrees[0]; assert.deepStrictEqual([e.etat, e.code, e.extrait], ['terminé', 0, 'réel']);
  J.evenement('dev-backend', id, { nature: 'refus', motif: 'après clôture' });
  e = J.lire('dev-backend').entrees[0]; assert.deepStrictEqual([e.etat, e.evenements.length], ['terminé', 1]);
  // fichier abîmé : ligne tronquée, ligne vide, JSON invalide, version inconnue
  fs.appendFileSync(J.FICHIER('dev-backend'), '\n{"v":1,"type":"ouv\n{pas du json}\n{"v":2,"type":"ouverture","id":"id-futur-0003"}\n' + '{"v":1,"type":"ouverture","id":"id-unique-0004","role":"dev-backend","debut":"2026-11-09T09:00:00.000Z"}\n{"v":1,"type":"cloture","id":"id-unique-0004","fin":"2026-11-09T09:00:01.000Z","duree":1,"etat":"terminé","code":0,"extrait":"","tronque":false}');
  const r = J.lire('dev-backend'); assert.strictEqual(r.total, 2); assert.ok(r.ignorees >= 3);
  assert.strictEqual(r.entrees.find(x => x.id === 'id-unique-0004').ticket, '', 'sans ticket : chaîne vide');
  fs.writeFileSync(J.FICHIER('qa'), Buffer.from([0, 1, 2, 255, 254, 10, 7, 7]));
  assert.doesNotThrow(() => J.lire('qa'));
  assert.deepStrictEqual(fs.statSync(J.FICHIER('dev-backend')).mode & 0o777, 0o600);
  assert.deepStrictEqual(fs.statSync(path.dirname(J.FICHIER('dev-backend'))).mode & 0o777, 0o700);
  void p;
});

test('CA10/CA11/L3/L4/L5 : tri décroissant et pagination', () => {
  neuf();
  for (const h of ['11', '10', '12']) J.ouvrir(base({ debut: `2026-11-09T${h}:00:00.000Z` }));
  assert.deepStrictEqual(J.lire('dev-backend').entrees.map(e => e.debut.slice(11, 13)), ['12', '11', '10']);
  assert.deepStrictEqual([J.lire('qa').entrees, J.lire('qa').total], [[], 0]);
  neuf();
  for (let i = 0; i < 45; i++) J.ouvrir(base({ debut: new Date(Date.UTC(2026, 10, 9, 0, i)).toISOString() }));
  const pages = [0, 20, 40].map(d => J.lire('dev-backend', { depuis: d, nombre: 20 }));
  assert.deepStrictEqual(pages.map(p => [p.entrees.length, p.suite]), [[20, true], [20, true], [5, false]]);
  assert.strictEqual(pages[0].total, 45);
  for (const [d, n] of [[9999, 20], [-1, 20], ['abc', 20], [0, 0], [0, 100000], [0, 'x']]) assert.doesNotThrow(() => J.lire('dev-backend', { depuis: d, nombre: n }));
  assert.strictEqual(J.lire('dev-backend', { depuis: 9999 }).entrees.length, 0);
  assert.ok(J.lire('dev-backend', { nombre: 100000 }).entrees.length <= 100);
});

test('L21/L23 : durée jamais négative ; L22 : stockage en UTC', () => {
  neuf();
  const id = J.ouvrir(base({ debut: '2026-03-29T00:30:00Z' }));
  J.clore('dev-backend', id, { fin: '2026-03-29T00:00:00Z', code: 0 });
  const e = J.lire('dev-backend').entrees[0]; assert.strictEqual(e.duree, 0); assert.strictEqual(e.debut, '2026-03-29T00:30:00.000Z');
  const id2 = J.ouvrir(base({ debut: '2026-03-01T00:00:00Z' })); J.clore('dev-backend', id2, { fin: '2026-03-08T00:00:00Z', code: 0 });
  assert.strictEqual(J.lire('dev-backend').entrees.find(x => x.id === id2).duree, 7 * 86400);
});

// ---------- Rétention, réconciliation, réglages ----------
test('CA18/L24/L25 : purge par âge et par nombre, une entrée en cours jamais supprimée', () => {
  neuf();
  const maintenant = Date.parse('2026-11-09T12:00:00Z'), jour = 864e5;
  const lignes = [];
  for (let i = 0; i < 600; i++) {
    const id = 'purge-' + String(i).padStart(4, '0'), debut = new Date(maintenant - (i < 50 ? (100 + i) * jour : (89 - (i % 80)) * jour) - i * 1000).toISOString();
    lignes.push({ v: 1, type: 'ouverture', id, role: 'dev-backend', debut, hote: { pid: 1 } }, { v: 1, type: 'cloture', id, fin: debut, duree: 1, etat: 'terminé', code: 0, extrait: '', tronque: false });
  }
  lignes.push({ v: 1, type: 'ouverture', id: 'en-cours-0001', role: 'dev-backend', debut: new Date(maintenant - 100 * jour).toISOString(), hote: { pid: 1 } });
  fs.mkdirSync(path.dirname(J.FICHIER('dev-backend')), { recursive: true });
  fs.writeFileSync(J.FICHIER('dev-backend'), lignes.map(l => JSON.stringify(l) + '\n').join(''));
  J.purger('dev-backend', { maintenant });
  const r = J.replier('dev-backend').liste;
  assert.ok(r.length <= 500, String(r.length));
  assert.ok(r.filter(e => e.etat !== 'en cours').every(e => maintenant - Date.parse(e.debut) <= 90 * jour));
  assert.ok(r.some(e => e.id === 'en-cours-0001'));
  assert.deepStrictEqual(fs.readdirSync(path.dirname(J.FICHIER('dev-backend'))), ['dev-backend.jsonl']);
  neuf();
  const ids = []; for (let i = 0; i < 30; i++) ids.push(J.ouvrir(base({ debut: '2020-01-01T00:00:00Z' })));
  J.purger('dev-backend', { maintenant, jours: 1, max: 10 });
  assert.strictEqual(J.replier('dev-backend').liste.length, 30, 'tout est en cours : rien n\'est supprimé');
  assert.deepStrictEqual(J.normaliserReglages({ jours: 0, max: 5 }), { actif: true, jours: 1, max: 10 });
  assert.deepStrictEqual(J.normaliserReglages({ jours: 5000, max: 20000 }), { actif: true, jours: 3650, max: 10000 });
  assert.deepStrictEqual(J.normaliserReglages({ jours: 'x', max: 'abc' }), { actif: true, jours: 90, max: 500 });
});

test('CA3/L29 : réconciliation d\'un hôte mort, sans rien relancer ; entrées saines inchangées', async () => {
  neuf();
  const enfant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  await new Promise(ok => enfant.once('spawn', ok));
  const mort = J.ouvrir(base({ hote: { pid: enfant.pid } })), vivant = J.ouvrir(base()), vieux = J.ouvrir(base({ debut: Date.now() - 3 * 3600e3 })), clos = J.ouvrir(base());
  J.clore('dev-backend', clos, { code: 0 });
  enfant.kill('SIGKILL'); await new Promise(ok => enfant.once('exit', ok));
  assert.strictEqual(J.reconcilier('dev-backend'), 2);
  const par = Object.fromEntries(J.lire('dev-backend').entrees.map(e => [e.id, e]));
  assert.deepStrictEqual([par[mort].etat, par[mort].code, par[vieux].etat, par[vivant].etat, par[clos].etat], ['interrompu', null, 'interrompu', 'en cours', 'terminé']);
  assert.strictEqual(J.reconcilier('dev-backend'), 0, 'idempotent');
});

test('E6 : journalAgents.actif=false, aucune écriture ; lecture de l\'existant intacte', () => {
  const T = tmp('siege-r-'); fs.mkdirSync(path.join(T, 'droits'));
  neuf(); const id = J.ouvrir(base()); assert.ok(id);
  fs.writeFileSync(path.join(T, 'droits', 'autorisations.json'), JSON.stringify({ journalAgents: { actif: false, jours: 30 } }));
  process.env.SIEGE_RACINE = T;
  try {
    assert.deepStrictEqual(J.reglages(), { actif: false, jours: 30, max: 500 });
    assert.strictEqual(J.ouvrir(base()), null); assert.strictEqual(J.lire('dev-backend').total, 1);
    assert.strictEqual(J.erreurJournal(), null);
  } finally { delete process.env.SIEGE_RACINE; }
});

// ---------- Défaillances (R8) ----------
test('CA15/E1-E4 : écriture impossible, verrou : jamais d\'exception, témoin déposé', () => {
  const t = path.join(os.tmpdir(), `siege-journal-erreur-${process.getuid()}.json`); J.effacerErreur();
  const p = neuf(); fs.writeFileSync(path.join(p, 'journaux'), 'je suis un fichier');   // mkdir impossible
  assert.doesNotThrow(() => { assert.strictEqual(J.ouvrir(base()), null); assert.strictEqual(J.clore('dev-backend', 'id-inconnu-0005', { code: 0 }), false); assert.strictEqual(J.evenement('dev-backend', 'id-inconnu-0005', { nature: 'refus' }), false); });
  const w = J.erreurJournal(); assert.ok(w && w.role === 'dev-backend' && w.date, 'témoin déposé'); assert.ok(fs.existsSync(t));
  J.effacerErreur();
  // ENOSPC sur l'ajout
  neuf(); const orig = fs.appendFileSync;
  fs.appendFileSync = () => { const e = new Error('ENOSPC'); e.code = 'ENOSPC'; throw e; };
  try { assert.doesNotThrow(() => J.ouvrir(base())); assert.ok(J.erreurJournal()); } finally { fs.appendFileSync = orig; J.effacerErreur(); }
  // verrou frais tenu : abandon vers 500 ms (jamais 2 s) ; verrou périmé : retiré, l'écriture passe
  neuf(); fs.mkdirSync(path.dirname(J.FICHIER('dev-backend')), { recursive: true });
  const verrou = J.FICHIER('dev-backend') + '.lock'; fs.writeFileSync(verrou, '');
  let d0 = Date.now(); assert.strictEqual(J.ouvrir(base()), null); const dt = Date.now() - d0; assert.ok(dt >= 400 && dt < 1500, dt + ' ms');
  J.effacerErreur();
  const vieux = new Date(Date.now() - 11e3); fs.utimesSync(verrou, vieux, vieux);
  assert.ok(J.ouvrir(base())); assert.ok(!fs.existsSync(verrou));
});

test('CA14/L26 : 20 écritures de 20 processus réels, une purge en boucle : aucune perdue', () => {
  const p = neuf(), script = path.join(p, 'ecrivain.js');
  fs.writeFileSync(script, `const J = require(${JSON.stringify(path.join(__dirname, '..', 'lib', 'journal-agents'))});
const id = J.ouvrir({ role: 'dev-backend', filiale: 'F', ticket: 'EIA-0' + (10 + Number(process.argv[2])), etape: '4', moteur: 'claude', modele: 'm' });
J.clore('dev-backend', id, { code: 0, sortie: 'fini ' + process.argv[2] }); process.exit(id ? 0 : 3);`);
  const env = { ...process.env, SIEGE_PRIVE: p }, procs = [];
  for (let i = 0; i < 20; i++) procs.push(new Promise(ok => spawn(process.execPath, [script, String(i)], { env }).on('exit', c => ok(c))));
  return Promise.all(procs).then(codes => {
    assert.ok(codes.every(c => c === 0), codes.join());
    const r = J.lire('dev-backend', { nombre: 100 });
    assert.strictEqual(r.total, 20); assert.strictEqual(new Set(r.entrees.map(e => e.id)).size, 20);
    assert.ok(r.entrees.every(e => e.etat === 'terminé') && r.ignorees === 0);
    for (const l of brut('dev-backend').split('\n').filter(Boolean)) JSON.parse(l);
    assert.deepStrictEqual(fs.readdirSync(path.dirname(J.FICHIER('dev-backend'))), ['dev-backend.jsonl']);
  });
});

// ---------- Exceptions (R4, CA6, CA7, E17, E18) ----------
test('CA6/CA7/E17/E18 : le cycle d\'une exception est inscrit sur l\'entrée du lancement', () => {
  neuf(); delete require.cache[require.resolve('../lib/exceptions')]; const ex = require('../lib/exceptions');
  const id = J.ouvrir(base({ role: 'qa', ticket: 'EIA-017' }));
  J.evenement('qa', id, { nature: 'refus', outil: 'Bash', motif: 'curl -s http://exemple.invalide/x', raison: 'Commande non autorisée' });
  const e1 = ex.demander({ agent: 'qa', ticket: 'EIA-017', type: 'bash', motif: 'curl -s http://exemple.invalide/x', justification: 'indispensable à la recette EIA-017' });
  assert.strictEqual(e1.journal, id);
  ex.decider(e1.id, true); ex.activer(e1.id); ex.terminerPourAgent('qa');
  const e = J.lire('qa').entrees[0];
  assert.deepStrictEqual(e.evenements.map(x => x.nature), ['refus', 'exception_demandee', 'exception_accordee', 'exception_activee', 'exception_terminee']);
  assert.ok(e.evenements.slice(1).every(x => x.exception === e1.id && x.date));
  assert.strictEqual(e.evenements[0].motif, 'curl -s http://exemple.invalide/x');
  const e2 = ex.demander({ agent: 'qa', ticket: 'EIA-017', type: 'web', motif: 'registry.npmjs.org', justification: 'installer une dépendance de test' });
  ex.decider(e2.id, false);
  assert.ok(J.lire('qa').entrees[0].evenements.some(x => x.nature === 'exception_refusee' && x.exception === e2.id));
  assert.strictEqual(ex.lire().liste.find(x => x.id === e2.id).statut, 'refusee');
  const e3 = ex.demander({ agent: 'product-owner', ticket: 'EIA-099', type: 'web', motif: 'example.org', justification: 'consulter une référence externe' });
  assert.ok(e3.id && e3.journal === undefined);
});

// ---------- Garde (hook) ----------
function arbre() {
  const T = tmp('siege-jg-');
  fs.cpSync(path.join(R, 'siege'), path.join(T, 'siege'), { recursive: true }); fs.mkdirSync(path.join(T, 'droits')); fs.mkdirSync(path.join(T, '.claude', 'agents'), { recursive: true });
  fs.cpSync(path.join(R, 'droits', 'roles.json'), path.join(T, 'droits', 'roles.json')); fs.cpSync(path.join(R, '.claude', 'agents'), path.join(T, '.claude', 'agents'), { recursive: true });
  const prive = path.join(T, 'prive'), env = { ...process.env, SIEGE_PRIVE: prive, SIEGE_RACINE: T };
  delete env.SIEGE_ROLE; delete env.SIEGE_EXECUTION;
  const g = (h, extra = {}) => spawnSync(process.execPath, [path.join(T, 'siege', 'garde.js')], { encoding: 'utf8', env: { ...env, ...extra }, input: JSON.stringify({ session_id: 's1', cwd: T, hook_event_name: 'PreToolUse', ...h }) });
  return { T, prive, env, g };
}
const lireDans = (prive, role) => { const prev = process.env.SIEGE_PRIVE; process.env.SIEGE_PRIVE = prive; try { return J.lire(role, { nombre: 100 }); } finally { process.env.SIEGE_PRIVE = prev; } };

test('garde : un sous-agent confié est ouvert, ses refus journalisés, la clôture écrit la fin de son historique', () => {
  const { T, prive, g } = arbre();
  const prompt = 'Filiale : Entreprise IA — dossier projets/x\nTicket : EIA-017\nÉtape : 4 · Développement\nFais ceci.';
  let r = g({ tool_name: 'Agent', tool_input: { subagent_type: 'dev-backend', model: 'claude-sonnet-5-5', prompt } });
  assert.strictEqual(r.status, 0, r.stderr);
  let e = lireDans(prive, 'dev-backend').entrees[0];
  assert.deepStrictEqual([e.etat, e.ticket, e.etape, e.filiale, e.moteur, e.modele, e.hote.session], ['en cours', 'EIA-017', '4 · Développement', 'Entreprise IA', 'claude', 'claude-sonnet-5-5', 's1']);
  assert.match(e.empreinte, /^sha256:[0-9a-f]{64}$/);
  // refus : décision inchangée (code 2, message), événement inscrit avec le motif exact
  r = g({ agent_type: 'dev-backend', tool_name: 'Bash', tool_input: { command: 'curl -s http://exemple.invalide/x' } });
  assert.strictEqual(r.status, 2); assert.match(r.stderr, /Refusé par la garde du Siège/);
  e = lireDans(prive, 'dev-backend').entrees[0];
  assert.deepStrictEqual([e.evenements[0].nature, e.evenements[0].outil, e.evenements[0].motif], ['refus', 'Bash', 'curl -s http://exemple.invalide/x']);
  // clôture : dernier message de l'historique du sous-agent
  const h = path.join(T, 'sub.jsonl');
  fs.writeFileSync(h, [{ type: 'user', message: { content: prompt } }, { type: 'assistant', message: { content: [{ type: 'text', text: 'Passation · Fait : ok ' + 'sk-' + 'z'.repeat(30) }] } }].map(x => JSON.stringify(x)).join('\n') + '\n');
  r = g({ hook_event_name: 'SubagentStop', agent_type: 'dev-backend', agent_transcript_path: h });
  assert.strictEqual(r.status, 0, r.stderr);
  e = lireDans(prive, 'dev-backend').entrees[0];
  assert.deepStrictEqual([e.etat, e.code], ['terminé', 0]); assert.ok(e.extrait.startsWith('Passation · Fait : ok') && !e.extrait.includes('sk-zzz'));
});

test('E12/E13 : deux sous-agents du même rôle, rattachement par empreinte ou « incertain »', () => {
  const { T, prive, g } = arbre();
  const p = n => `Filiale : Filiale${n}\nTicket : EIA-017\nÉtape : 5 · Recette\nMission ${n}`;
  for (const n of [17, 18]) assert.strictEqual(g({ tool_name: 'Agent', tool_input: { subagent_type: 'qa', prompt: p(n) } }).status, 0);
  assert.strictEqual(lireDans(prive, 'qa').total, 2);
  const h = path.join(T, 'qa18.jsonl'); fs.writeFileSync(h, JSON.stringify({ type: 'user', message: { content: p(18) } }) + '\n');
  g({ agent_type: 'qa', agent_transcript_path: h, tool_name: 'Bash', tool_input: { command: 'curl -s http://exemple.invalide/x' } });
  let par = Object.fromEntries(lireDans(prive, 'qa').entrees.map(e => [e.filiale, e]));
  assert.strictEqual(par.Filiale18.evenements.length, 1); assert.strictEqual(par.Filiale18.evenements[0].incertain, undefined); assert.strictEqual(par.Filiale17.evenements.length, 0);
  g({ agent_type: 'qa', tool_name: 'Bash', tool_input: { command: 'curl -s http://exemple.invalide/x' } });   // sans champs de hook
  par = Object.fromEntries(lireDans(prive, 'qa').entrees.map(e => [e.filiale, e]));
  assert.strictEqual(par.Filiale18.evenements.length + par.Filiale17.evenements.length, 2);
  assert.ok([...par.Filiale17.evenements, ...par.Filiale18.evenements].some(x => x.incertain === true));
});

test('E10/E11/NR1 : la décision de la garde est identique avec ou sans journal, même en panne', () => {
  const { prive, env, T } = arbre();
  const hook = { session_id: 's9', cwd: T, hook_event_name: 'PreToolUse', agent_type: 'dev-backend', tool_name: 'Write', tool_input: { file_path: path.join(T, 'droits', 'roles.json'), content: 'x' } };
  const lancer = e => spawnSync(process.execPath, [path.join(T, 'siege', 'garde.js')], { encoding: 'utf8', env: e, input: JSON.stringify(hook) });
  const a = lancer(env);
  fs.writeFileSync(path.join(prive, 'journaux'), 'bloque');   // dossier du journal impossible à créer
  const b = lancer(env);
  assert.deepStrictEqual([b.status, b.stderr], [a.status, a.stderr]); assert.strictEqual(a.status, 2);
  const c = lancer({ ...env, SIEGE_PRIVE: path.join(prive, 'inexistant', 'x') });
  assert.strictEqual(c.status, 2);
  assert.ok(fs.readFileSync(path.join(prive, 'journal-garde.jsonl'), 'utf8').includes('"refus"'), 'journal global toujours alimenté');
});

test('CA16/NR4 : un agent n\'écrit ni ne supprime le journal ; ~/.siege est protégé en écriture dans le bac à sable', () => {
  const garde = require('../lib/garde'), P = garde.charger(R), f = path.join(os.homedir(), '.siege', 'journaux', 'agents', 'dev-backend.jsonl');
  const d = (outil, entree) => garde.decider(P, { outil, entree }, { racine: R, role: 'dev-backend', exceptions: [] });
  assert.ok(!d('Write', { file_path: f, content: 'x' }).ok); assert.ok(!d('Edit', { file_path: f, old_string: 'a', new_string: 'b' }).ok);
  assert.ok(!d('Bash', { command: 'rm ' + f }).ok); assert.ok(!d('Bash', { command: 'echo x >> ' + f }).ok);
  const s = require('../lib/parametres').settings(R);
  assert.ok(s.sandbox.filesystem.denyWrite.includes('~/.siege') && s.sandbox.filesystem.denyRead.includes('~/.siege'));
});

// ---------- Moteurs externes et demandes ----------
function faux(T, code, sortie) {
  const bin = path.join(T, 'bin', 'codex');
  fs.writeFileSync(bin, `#!/usr/bin/env node
const a = process.argv.slice(2), fs = require('fs');
if (a[0] === '--version') { console.log('codex-cli 9.9.9'); process.exit(0); }
if (a[0] === 'debug') { console.log(JSON.stringify({ models: [{ slug: 'gpt-a', display_name: 'A', visibility: 'list', priority: 1 }] })); process.exit(0); }
if (a[0] === 'exec') { console.log(${JSON.stringify(sortie)}); fs.writeFileSync(a[a.indexOf('-o') + 1], 'Fait : ok'); process.exit(${code}); }
process.exit(2);
`, { mode: 0o755 }); return bin;
}
function siegeCodex() {
  const T = tmp('siege-jc-');
  for (const d of ['droits', 'portfolio', 'projets/api', '.claude/agents', 'prive', 'bin']) fs.mkdirSync(path.join(T, d), { recursive: true });
  fs.cpSync(path.join(R, 'siege'), path.join(T, 'siege'), { recursive: true }); fs.copyFileSync(path.join(R, '.claude', 'agents', 'dev-backend.md'), path.join(T, '.claude', 'agents', 'dev-backend.md'));
  fs.writeFileSync(path.join(T, 'portfolio', 'filiales.md'), '| Filiale | Préfixe | Dossier | Repo git | Statut |\n|---|---|---|---|---|\n| API | API | `projets/api` | `projets/api` | Active |\n');
  fs.writeFileSync(path.join(T, 'portfolio', 'features.json'), JSON.stringify({ elements: [{ id: 'API-001', titre: 'Santé', rang: 1, filiale: 'API', statut: 'En cours', dependances: [] }] }));
  fs.writeFileSync(path.join(T, 'portfolio', 'source-backlog.json'), '{"type":"fichier"}'); fs.writeFileSync(path.join(T, 'projets', 'api', 'CLAUDE.md'), '# Fiche\n');
  return T;
}
test('CA17/E7 : agent Codex journalisé (code 0 puis 2 avec secret), agents-externes.log conservé', () => {
  const T = siegeCodex(), prive = path.join(T, 'prive'), codex = path.join(T, 'bin', 'codex');
  const env = { ...process.env, SIEGE_RACINE: T, SIEGE_PRIVE: prive, CODEX_BIN: codex, GEMINI_BIN: '/absent', CLAUDE_BIN: '/absent' };
  const node = (a, e = env) => spawnSync(process.execPath, a, { env: e, cwd: T, encoding: 'utf8' });
  faux(T, 0, 'travail terminé');
  node(['-e', `require(${JSON.stringify(path.join(T, 'siege/lib/moteurs'))}).activerMoteur('codex', true)`]);
  const lancer = (e = env) => node([path.join(T, 'siege', 'agent.js'), 'lancer', '--moteur', 'codex', '--modele', 'gpt-a', '--role', 'dev-backend', '--filiale', 'API', '--ticket', 'API-001', '--etape', '4 · Développement', '--mission', 'Ajouter un endpoint GET /sante et ses tests.'], e);
  let r = lancer(); assert.strictEqual(r.status, 0, r.stderr);
  faux(T, 2, 'échec avec ' + FAUX);
  r = lancer(); assert.strictEqual(r.status, 0, r.stderr);
  const e = lireDans(prive, 'dev-backend').entrees.reverse();
  assert.deepStrictEqual(e.map(x => [x.moteur, x.modele, x.ticket, x.etape, x.etat, x.code]), [['codex', 'gpt-a', 'API-001', '4 · Développement', 'terminé', 0], ['codex', 'gpt-a', 'API-001', '4 · Développement', 'échec', 2]]);
  assert.ok(e[0].extrait.includes('travail terminé') && !e[1].extrait.includes(FAUX) && e[1].extrait.includes('[MASQUÉ]'));
  const log = fs.readFileSync(path.join(prive, 'agents-externes.log'), 'utf8');
  assert.match(log, /=== .* codex\/gpt-a dev-backend API-001 étape 4 · Développement/); assert.ok(log.includes('travail terminé'), 'la sortie de Codex reste dans agents-externes.log');
  assert.strictEqual((log.match(/^=== /gm) || []).length, 2);
  assert.ok(e.every(x => x.etat !== 'en cours'), 'aucune entrée en cours orpheline');
});

test('lancerClaude : session de demande journalisée (rôle directeur), directeur-demandes.log inchangé', async () => {
  const p = neuf(), bin = path.join(p, 'faux-claude.js'); delete require.cache[require.resolve('../lib/messagerie')];
  const { lancerClaude } = require('../lib/messagerie');
  for (const [code, attendu] of [[0, 'terminé'], [3, 'échec']]) {
    fs.writeFileSync(bin, `#!/usr/bin/env node\nconsole.log('bilan ${FAUX}'); process.exit(${code});\n`, { mode: 0o755 });
    process.env.CLAUDE_BIN = bin;
    try { await lancerClaude(R, 'DEM-001', () => {}); } catch {}
    const e = J.lire('directeur').entrees[0];
    assert.deepStrictEqual([e.etat, e.code, e.moteur, e.ticket], [attendu, code, 'claude', '']);
    assert.ok(e.extrait.includes('bilan') && !e.extrait.includes(FAUX));
  }
  const log = fs.readFileSync(path.join(p, 'directeur-demandes.log'), 'utf8');
  assert.match(log, /=== .* \/demande DEM-001/); assert.ok(log.includes('bilan'));
  delete process.env.CLAUDE_BIN;
});

// ---------- Serveur : lecture exposée à l'interface ----------
test('serveur : GET /api/agents/<rôle>/journal (pagination, rôle inconnu, traversée), témoin d\'erreur dans sujetsCeo', async () => {
  const T = tmp('siege-js-'); for (const d of ['droits', 'portfolio', '.claude/agents']) fs.mkdirSync(path.join(T, d), { recursive: true });
  fs.copyFileSync(path.join(R, '.claude', 'agents', 'dev-backend.md'), path.join(T, '.claude', 'agents', 'dev-backend.md'));
  fs.writeFileSync(path.join(T, 'portfolio', 'source-backlog.json'), '{"type":"fichier"}'); fs.writeFileSync(path.join(T, 'portfolio', 'filiales.md'), '| Filiale | Préfixe | Dossier | Repo git | Statut |\n|---|---|---|---|---|\n');
  process.env.SIEGE_RACINE = T; neuf(); process.env.SIEGE_RACINE = T;
  const s = require('../server');
  for (let i = 0; i < 25; i++) J.ouvrir(base({ debut: new Date(Date.UTC(2026, 10, 9, 0, i)).toISOString() }));
  await new Promise(ok => s.serveur.listen(0, '127.0.0.1', ok));
  const port = s.serveur.address().port;
  const get = u => new Promise(ok => http.get({ host: '127.0.0.1', port, path: u }, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => ok({ code: res.statusCode, json: (() => { try { return JSON.parse(b); } catch { return null; } })() })); }));
  try {
    let r = await get('/api/agents/dev-backend/journal?depuis=0&nombre=20');
    assert.deepStrictEqual([r.code, r.json.entrees.length, r.json.total, r.json.suite], [200, 20, 25, true]);
    assert.ok(Date.parse(r.json.entrees[0].debut) > Date.parse(r.json.entrees[19].debut));
    r = await get('/api/agents/dev-backend/journal?depuis=20&nombre=20'); assert.deepStrictEqual([r.json.entrees.length, r.json.suite], [5, false]);
    r = await get('/api/agents/dev-backend/journal?depuis=abc&nombre=-4'); assert.strictEqual(r.code, 200);
    for (const u of ['/api/agents/inconnu/journal', '/api/agents/..%2F..%2Fx/journal', '/api/agents/Dev/journal']) assert.strictEqual((await get(u)).code, 404, u);
    J.effacerErreur();
    assert.ok(!(await s.sujetsCeo()).some(([k]) => k.startsWith('journal-erreur:')));
    fs.writeFileSync(J.TEMOIN(), JSON.stringify({ date: new Date().toISOString(), role: 'qa', erreur: 'ENOSPC' }));
    const cles = (await s.sujetsCeo()).map(([k]) => k).filter(k => k.startsWith('journal-erreur:'));
    assert.deepStrictEqual(cles, ['journal-erreur:' + new Date().toISOString().slice(0, 10)]);
  } finally { s.serveur.close(); J.effacerErreur(); delete process.env.SIEGE_RACINE; }
});
