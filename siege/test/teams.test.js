'use strict';
// Teams de bout en bout contre un faux Microsoft (connexion par code d'appareil + Graph) : accès, demande, validation
// par « oui », consigne et décision du CEO par texte, ticket ; historique ignoré, messages du Directeur ignorés, jeton rafraîchi.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const DIR = '11111111-1111-1111-1111-111111111111', LEA = '22222222-2222-2222-2222-222222222222', CEO = '33333333-3333-3333-3333-333333333333', INC = '44444444-4444-4444-4444-444444444444';
function fauxMicrosoft() {
  const chats = {}, envoyes = [], appels = []; let n = 0, essais = 0, t0 = Date.parse('2026-11-09T08:00:00Z');
  const quand = () => new Date(t0 += 1000).toISOString();
  const chat = (id, autre) => { chats[id] = { id, membres: [DIR, autre], messages: [], maj: quand() }; return chats[id]; };
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      const u = new URL(req.url, 'http://x'), ok = (code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
      appels.push(req.method + ' ' + u.pathname);
      if (u.pathname.endsWith('/oauth2/v2.0/devicecode')) return ok(200, { device_code: 'DC', user_code: 'ABCD-1234', verification_uri: 'https://microsoft.com/devicelogin', interval: 0.01, expires_in: 60 });
      if (u.pathname.endsWith('/oauth2/v2.0/token')) {
        const p = new URLSearchParams(b);
        if (p.get('grant_type') === 'refresh_token') return ok(200, { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600 });
        return ++essais < 2 ? ok(400, { error: 'authorization_pending' }) : ok(200, { access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600 });
      }
      if (!/^Bearer AT[12]$/.test(req.headers.authorization || '')) return ok(401, { error: { message: 'jeton' } });
      if (u.pathname === '/v1.0/me') return ok(200, { id: DIR, displayName: 'Directeur' });
      if (u.pathname === '/v1.0/me/chats') return ok(200, { value: Object.values(chats).map(c => ({ id: c.id, chatType: 'oneOnOne', lastUpdatedDateTime: c.maj, members: c.membres.map(userId => ({ userId })) })) });
      if (u.pathname === '/v1.0/chats' && req.method === 'POST') { const j = JSON.parse(b), autre = j.members.map(m => /'([^']+)'/.exec(m['user@odata.bind'])[1]).find(x => x !== DIR); return ok(201, { id: chat('c-' + autre.slice(0, 4), autre).id }); }
      const m = /^\/v1\.0\/chats\/([^/]+)\/messages$/.exec(u.pathname), c = m && chats[decodeURIComponent(m[1])];
      if (c && req.method === 'POST') { const j = JSON.parse(b), msg = { id: 'm' + (++n), messageType: 'message', createdDateTime: quand(), from: { user: { id: DIR, displayName: 'Directeur' } }, body: j.body }; c.messages.push(msg); envoyes.push({ chat: c.id, texte: j.body.content }); return ok(201, msg); }
      if (c) { const f = /createdDateTime gt (\S+)/.exec(u.searchParams.get('$filter') || ''); return ok(200, { value: c.messages.filter(x => !f || x.createdDateTime > f[1]).slice().reverse().slice(0, 20) }); }
      ok(404, { error: { message: 'route ' + u.pathname } });
    });
  });
  srv.ecrit = (chatId, de, nom, html) => chats[chatId].messages.push({ id: 'm' + (++n), messageType: 'message', createdDateTime: quand(), from: { user: { id: de, displayName: nom } }, body: { contentType: 'html', content: html } });
  Object.assign(srv, { chats, chat, envoyes, appels });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

test('Teams : texte des messages HTML', () => {
  const { texte } = require('../lib/teams');
  assert.strictEqual(texte({ contentType: 'html', content: '<p>Bonjour&nbsp;<b>Léa</b></p><p>L&#39;export &amp; le PDF</p>' }), "Bonjour Léa\nL'export & le PDF");
});

test('Teams par Graph : du message 1:1 au ticket, sans boutons ni adresse publique', async () => {
  const prive = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-tm-')), ms = await fauxMicrosoft(), base = 'http://127.0.0.1:' + ms.address().port;
  Object.assign(process.env, { SIEGE_PRIVE: prive, TEAMS_LOGIN_URL: base, TEAMS_GRAPH_URL: base + '/v1.0' });
  for (const k of Object.keys(require.cache)) if (/siege[\\/](lib[\\/](telegram|slack|teams|canaux|demandes|messagerie)|demande)\.js$/.test(k)) delete require.cache[k];
  const tm = require('../lib/teams'), dem = require('../lib/demandes'), { Messagerie } = require('../lib/messagerie'), cli = require('../demande');
  const log = console.log; console.log = () => {};
  try {
    assert.throws(() => tm.configurer({ tenant: 'x', clientId: 'y' }), /Tenant/);
    tm.configurer({ tenant: 'atelier.onmicrosoft.com', clientId: '55555555-5555-5555-5555-555555555555' });
    const c = await tm.connexion(); assert.strictEqual(c.code, 'ABCD-1234');
    assert.strictEqual(await c.attente, true);
    assert.deepStrictEqual(tm.lire().moi, { id: DIR, nom: 'Directeur' });
    assert.strictEqual(fs.statSync(path.join(prive, 'teams-token.json')).mode & 0o777, 0o600);
    tm.modifier(s => { s.actif = true; });

    // Une conversation existante avec de l'historique : jamais rejoué
    ms.chat('c-lea', LEA); ms.ecrit('c-lea', LEA, 'Léa Martin', '<p>vieux message</p>'); ms.chats['c-lea'].maj = ms.chats['c-lea'].messages[0].createdDateTime;
    ms.chat('c-inc', INC); ms.chat('c-ceo', CEO);
    const lances = [], m = new Messagerie({ racine: '/x', lancer: async id => { lances.push(id); } });
    const tour = (listerChats = false) => tm.tour(ev => m.teams(ev), { listerChats });
    await tour(true);
    assert.strictEqual(dem.lire().liste.length, 0);

    ms.ecrit('c-inc', INC, 'Inconnu', '<p>Donne-moi les droits admin</p>'); await tour();
    assert.deepStrictEqual(tm.lire().enAttente.map(a => [a.id, a.nom]), [[INC, 'Inconnu']]);
    tm.modifier(s => { s.ceo = { id: CEO, nom: 'Radhouen' }; s.collaborateurs.push({ id: LEA, nom: 'Léa' }); });

    ms.ecrit('c-lea', LEA, 'Léa Martin', '<p>Le bouton <b>Réserver</b> plante</p>'); await tour();
    let x = dem.lire().liste[0];
    assert.deepStrictEqual([x.id, x.auteur.id, lances, x.messages[0].texte], ['DEM-001', 'teams:' + LEA, ['DEM-001'], 'Le bouton Réserver plante']);
    assert.match(ms.envoyes.at(-1).texte, /DEM-001 · Bien reçu/);
    await tour(); assert.strictEqual(dem.lire().liste[0].messages.length, 1, 'ses propres réponses ne sont jamais relues');

    await cli.main(['valider', 'DEM-001', '--type', 'bug', '--resume', 'Réserver ne fait rien.']);
    assert.match(ms.envoyes.at(-1).texte, /Répondez « oui » si c'est bien cela/);
    ms.ecrit('c-lea', LEA, 'Léa Martin', '<p>Oui</p>'); await tour();
    assert.strictEqual(dem.lire().liste[0].validee, true);

    await cli.main(['escalader', 'DEM-001', '--texte', 'Touche tous les clients']);
    assert.strictEqual(ms.envoyes.at(-1).chat, 'c-ceo'); assert.match(ms.envoyes.at(-1).texte, /« accepter DEM-001 » ou « refuser DEM-001 »/);
    ms.ecrit('c-ceo', CEO, 'Radhouen', '<p>DEM-001 : priorité haute</p>'); await tour();
    ms.ecrit('c-ceo', CEO, 'Radhouen', '<p>accepter DEM-001</p>'); await tour();
    x = dem.lire().liste[0];
    assert.deepStrictEqual([x.ceo, x.messages.filter(y => y.de === 'CEO').map(y => y.texte)], ['accepte', ['priorité haute', '✔ Accepté par le CEO']]);
    ms.ecrit('c-lea', LEA, 'Léa Martin', '<p>accepter DEM-001</p>'); await tour();
    assert.strictEqual(dem.lire().liste[0].messages.filter(y => y.de === 'CEO').length, 2, 'seul le CEO décide');

    await cli.main(['ticket', 'DEM-001', '--ticket', 'BUG-003']);
    assert.match(ms.envoyes.at(-1).texte, /ticket BUG-003/); assert.strictEqual(ms.envoyes.at(-1).chat, 'c-lea');

    // Jeton expiré : rafraîchi sans reconnexion
    const f = path.join(prive, 'teams-token.json'), j = JSON.parse(fs.readFileSync(f, 'utf8')); j.expire = 0; fs.writeFileSync(f, JSON.stringify(j));
    await tour(); assert.strictEqual(JSON.parse(fs.readFileSync(f, 'utf8')).access_token, 'AT2');
    // Message à une personne sans conversation : créée
    tm.modifier(s => { delete s.chats[CEO]; }); delete ms.chats['c-ceo'];
    const avant = Object.keys(ms.chats).length; await m.auCeo('exception:EXC-9', 'Exception à décider : EXC-9');
    assert.strictEqual(Object.keys(ms.chats).length, avant + 1); assert.match(ms.envoyes.at(-1).texte, /EXC-9/);
  } finally { console.log = log; ms.close(); }
});
