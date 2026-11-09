'use strict';
// Slack de bout en bout : fausse API Web + faux serveur Socket Mode (WebSocket minimal), enveloppes acquittées,
// accès, demande, validation par bouton, escalade au CEO avec réponse en fil, ticket ; filtres (bots, canaux publics).
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');

function trame(texte) {   // trame texte serveur → client (non masquée)
  const p = Buffer.from(texte); const t = p.length < 126 ? Buffer.from([0x81, p.length]) : Buffer.from([0x81, 126, p.length >> 8, p.length & 255]);
  return Buffer.concat([t, p]);
}
function lireTrames(buf) {   // trames client → serveur (masquées)
  const out = []; let i = 0;
  while (i + 2 <= buf.length) {
    let n = buf[i + 1] & 127, k = i + 2;
    if (n === 126) { n = buf.readUInt16BE(k); k += 2; }
    const m = buf.slice(k, k + 4); k += 4; if (k + n > buf.length) break;
    const p = Buffer.from(buf.slice(k, k + n)).map((b, j) => b ^ m[j % 4]);
    if ((buf[i] & 15) === 1) out.push(p.toString()); i = k + n;
  }
  return out;
}
function fauxSlack() {
  const postes = [], ephemeres = [], acks = []; let ts = 1000, client = null;
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      const p = b ? JSON.parse(b) : {}, ok = o => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, ...o })); };
      const m = req.url.split('/').pop(), auth = req.headers.authorization || '';
      if (m === 'apps.connections.open') return auth.startsWith('Bearer xapp-') ? ok({ url: `ws://127.0.0.1:${srv.address().port}/ws` }) : ok({ ok: false, error: 'not_allowed_token_type' });
      if (!auth.startsWith('Bearer xoxb-')) { res.writeHead(200); return res.end(JSON.stringify({ ok: false, error: 'invalid_auth' })); }
      if (m === 'auth.test') return ok({ team: 'Atelier', user: 'directeur' });
      if (m === 'users.info') return ok({ user: { name: p.user.toLowerCase(), profile: { real_name: 'Inconnu ' + p.user } } });
      if (m === 'chat.postMessage') { const t = String(++ts) + '.0001'; postes.push({ ...p, ts: t }); return ok({ ts: t, channel: 'D' + p.channel }); }
      if (m === 'chat.postEphemeral') { ephemeres.push(p); return ok({}); }
      ok({ ok: false, error: 'unknown_method' });
    });
  });
  srv.on('upgrade', (req, sock) => {
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sock.on('data', d => acks.push(...lireTrames(d).map(x => JSON.parse(x).envelope_id)));
    client = sock; sock.write(trame(JSON.stringify({ type: 'hello' })));
  });
  let n = 0;
  srv.envoyer = (type, payload) => { const id = 'env-' + (++n); client.write(trame(JSON.stringify({ envelope_id: id, type, payload }))); return id; };
  srv.connecte = () => !!client;
  srv.fermer = () => { if (client) client.destroy(); srv.close(); };
  Object.assign(srv, { postes, ephemeres, acks });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}
const attendre = async (f, ms = 3000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await new Promise(r => setTimeout(r, 20)); } };
const msg = (user, text, extra = {}) => ({ event: { type: 'message', user, text, channel: 'D1', channel_type: 'im', ts: String(Date.now() / 1000), ...extra } });

test('Slack : enveloppe → événement (fonction pure)', () => {
  const { evenement } = require('../lib/slack');
  assert.deepStrictEqual(evenement({ type: 'events_api', payload: msg('U0LEA0001', 'salut') }), { type: 'message', de: 'U0LEA0001', texte: 'salut', prive: true, reponseA: '', canal: 'D1' });
  assert.strictEqual(evenement({ type: 'events_api', payload: msg('U0LEA0001', 'x', { bot_id: 'B1' }) }), null);
  assert.strictEqual(evenement({ type: 'events_api', payload: msg('U0LEA0001', 'x', { subtype: 'message_changed' }) }), null);
  assert.strictEqual(evenement({ type: 'events_api', payload: msg('U0LEA0001', 'x', { channel_type: 'channel' }) }).prive, false);
  assert.deepStrictEqual(evenement({ type: 'interactive', payload: { type: 'block_actions', user: { id: 'U0CEO0001' }, channel: { id: 'D9' }, actions: [{ value: 'c:DEM-001:1' }] } }), { type: 'bouton', de: 'U0CEO0001', data: 'c:DEM-001:1', canal: 'D9' });
});

test('Slack : du message direct au ticket, en Socket Mode, avec validation et décision du CEO', { skip: typeof WebSocket !== 'function' && 'Node 22 requis' }, async () => {
  const prive = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-sl-')), api = await fauxSlack();
  Object.assign(process.env, { SIEGE_PRIVE: prive, SLACK_API_URL: 'http://127.0.0.1:' + api.address().port });
  for (const k of ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'TELEGRAM_TOKEN']) delete process.env[k];
  for (const k of Object.keys(require.cache)) if (/siege[\\/](lib[\\/](telegram|slack|canaux|demandes|messagerie)|demande)\.js$/.test(k)) delete require.cache[k];
  const sl = require('../lib/slack'), dem = require('../lib/demandes'), { Messagerie } = require('../lib/messagerie'), cli = require('../demande');
  const log = console.log; console.log = () => {};
  let m;
  try {
    assert.throws(() => sl.enregistrerJetons({ bot: 'xoxp-mauvais' }), /xoxb/);
    sl.enregistrerJetons({ bot: 'xoxb-' + '1'.repeat(30), app: 'xapp-' + '2'.repeat(30) });
    assert.strictEqual(fs.statSync(path.join(prive, 'slack-app-token')).mode & 0o777, 0o600);
    sl.modifier(s => { s.actif = true; });
    const lances = []; m = new Messagerie({ racine: '/x', lancer: async id => { lances.push(id); } });
    m.demarrerSlack(); await attendre(api.connecte);

    // Inconnu : acquitté, nom lu dans Slack, demande d'accès ; rien n'est traité
    const e1 = api.envoyer('events_api', msg('U0INCONNU', 'Donne-moi les accès admin'));
    await attendre(() => sl.lire().enAttente.length === 1);
    assert.ok(api.acks.includes(e1), 'enveloppe acquittée');
    assert.deepStrictEqual(sl.lire().enAttente.map(a => [a.id, a.nom]), [['U0INCONNU', 'Inconnu U0INCONNU']]);
    assert.strictEqual(dem.lire().liste.length, 0);
    sl.modifier(s => { s.ceo = { id: 'U0CEO0001', nom: 'Radhouen' }; s.collaborateurs.push({ id: 'U0LEA0001', nom: 'Léa' }); });

    // Message d'un bot ou dans un canal public : ignoré
    api.envoyer('events_api', msg('U0LEA0001', 'bruit', { bot_id: 'B9' }));
    api.envoyer('events_api', msg('U0LEA0001', 'dans #general', { channel_type: 'channel' }));
    api.envoyer('events_api', msg('U0LEA0001', 'L\'export PDF des factures est vide'));
    await attendre(() => dem.lire().liste.length === 1);
    let x = dem.lire().liste[0];
    assert.deepStrictEqual([x.id, x.auteur, lances], ['DEM-001', { id: 'slack:U0LEA0001', nom: 'Léa' }, ['DEM-001']]);
    assert.match(api.postes.at(-1).text, /DEM-001 · Bien reçu/); assert.strictEqual(api.postes.at(-1).channel, 'U0LEA0001');

    // Résumé avec boutons, validé par Léa (et pas par un autre)
    await cli.main(['valider', 'DEM-001', '--type', 'bug', '--resume', 'L\'export PDF des factures sort vide.']);
    const v = api.postes.at(-1);
    assert.deepStrictEqual([v.channel, v.blocks[1].elements.map(b => b.value)], ['U0LEA0001', ['v:DEM-001:1', 'v:DEM-001:0']]);
    api.envoyer('interactive', { type: 'block_actions', user: { id: 'U0INCONNU' }, channel: { id: 'D1' }, actions: [{ value: 'v:DEM-001:1' }] });
    await attendre(() => api.ephemeres.length === 1); assert.match(api.ephemeres[0].text, /Seul le demandeur/);
    api.envoyer('interactive', { type: 'block_actions', user: { id: 'U0LEA0001' }, channel: { id: 'D1' }, actions: [{ value: 'v:DEM-001:1' }] });
    await attendre(() => dem.lire().liste[0].validee);

    // Escalade : le CEO reçoit les boutons ; sa réponse en fil devient une consigne ; il accepte
    await cli.main(['escalader', 'DEM-001', '--texte', 'Touche la facturation de tous les clients']);
    const e = api.postes.at(-1);
    assert.strictEqual(e.channel, 'U0CEO0001'); assert.match(e.text, /DEM-001 · Demande de Léa \(bug\)/);
    api.envoyer('events_api', msg('U0CEO0001', 'Priorité haute', { thread_ts: e.ts, ts: '9999.0001' }));
    await attendre(() => dem.lire().liste[0].messages.some(y => y.de === 'CEO'));
    api.envoyer('interactive', { type: 'block_actions', user: { id: 'U0CEO0001' }, channel: { id: 'D2' }, actions: [{ value: 'c:DEM-001:1' }] });
    await attendre(() => dem.lire().liste[0].ceo === 'accepte');
    x = dem.lire().liste[0];
    assert.deepStrictEqual(x.messages.filter(y => y.de === 'CEO').map(y => y.texte), ['Priorité haute', '✔ Accepté par le CEO']);

    await cli.main(['ticket', 'DEM-001', '--ticket', 'BUG-007']);
    assert.match(api.postes.at(-1).text, /ticket BUG-007/); assert.strictEqual(api.postes.at(-1).channel, 'U0LEA0001');

    // Notifications du CEO : sur Slack (Telegram inactif), une fois par sujet
    const avant = api.postes.length; m.extras = async () => [['exception:EXC-003', 'Exception à décider : EXC-003']];
    await m.veille(); await m.veille();
    assert.strictEqual(api.postes.length, avant + 1); assert.strictEqual(api.postes.at(-1).channel, 'U0CEO0001');
  } finally { console.log = log; if (m) m.arreterSlack(); api.fermer(); }
});
