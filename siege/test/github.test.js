'use strict';
// App GitHub contre une fausse API : jeton limité au rôle et au repo, push sans exposer le jeton, fusion encadrée.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto'), { execFileSync } = require('child_process');
const gh = require('../lib/github');

function fausseApi(cle) {
  const etat = { jetons: [], pr: { number: 7, state: 'open', mergeable: true, head: { sha: 'abc123' } }, avis: [], statuts: [], fusion: null };
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      const ok = (code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
      const auth = req.headers.authorization || '';
      if (req.url.endsWith('/access_tokens')) {
        const [h, p, s] = auth.slice(7).split('.');
        const valide = crypto.verify('RSA-SHA256', Buffer.from(h + '.' + p), cle.publicKey, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
        if (!valide) return ok(401, { message: 'JWT invalide' });
        const corps = JSON.parse(b); etat.jetons.push(corps); return ok(201, { token: 'ghs_jeton' + etat.jetons.length });
      }
      if (!auth.startsWith('Bearer ghs_')) return ok(401, { message: 'jeton' });
      if (req.method === 'GET' && /\/pulls\/7$/.test(req.url)) return ok(200, etat.pr);
      if (req.method === 'GET' && /\/pulls\/7\/reviews/.test(req.url)) return ok(200, etat.avis);
      if (req.method === 'GET' && /\/commits\/abc123\/status$/.test(req.url)) return ok(200, { statuses: etat.statuts });
      if (req.method === 'POST' && /\/statuses\/abc123$/.test(req.url)) { etat.statuts.unshift(JSON.parse(b)); return ok(201, {}); }
      if (req.method === 'PUT' && /\/pulls\/7\/merge$/.test(req.url)) { etat.fusion = JSON.parse(b); return ok(200, { merged: true }); }
      ok(404, { message: 'route ' + req.url });
    });
  });
  srv.etat = etat; return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

test('jeton par rôle, push sur branche autorisée seulement, fusion seulement après validations', async () => {
  const cle = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const srv = await fausseApi(cle); process.env.GITHUB_API_URL = 'http://127.0.0.1:' + srv.address().port;
  const politique = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'droits', 'roles.json')));
  const c = { app_id: 123, installation_id: 456, pem: cle.privateKey };
  try {
    const t = await gh.jetonRole(c, politique, 'reviewer', 'moi/repo');
    assert.strictEqual(t, 'ghs_jeton1');
    assert.deepStrictEqual(srv.etat.jetons[0], { repositories: ['repo'], permissions: { metadata: 'read', contents: 'read', pull_requests: 'read', statuses: 'write' } });
    await assert.rejects(gh.jetonRole(c, politique, 'product-owner', 'moi/repo'), /aucun droit GitHub/);

    // Push vers un dépôt local qui joue GitHub ; le jeton ne doit apparaître ni dans la commande ni dans la config
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-')), distant = path.join(d, 'moi', 'repo.git'), local = path.join(d, 'local');
    fs.mkdirSync(path.dirname(distant), { recursive: true });
    execFileSync('git', ['init', '-q', '--bare', distant]); execFileSync('git', ['init', '-q', '-b', 'main', local]);
    execFileSync('git', ['-C', local, '-c', 'user.name=a', '-c', 'user.email=a@b', 'commit', '-q', '--allow-empty', '-m', 'x']);
    execFileSync('git', ['-C', local, 'branch', 'feature/COL-001']);
    process.env.GITHUB_GIT_URL = d;
    gh.pousser(local, 'moi/repo', 'feature/COL-001', 'ghs_secret');
    assert.match(execFileSync('git', ['-C', distant, 'branch']).toString(), /feature\/COL-001/);
    assert.doesNotMatch(fs.readFileSync(path.join(local, '.git', 'config'), 'utf8'), /ghs_secret|extraheader/);
    assert.throws(() => gh.pousser(local, 'moi/repo', 'main', 'ghs_secret'), /jamais main/);

    // Fusion : refusée tant que CEO + revue + sécurité manquent
    let f = await gh.fusionnable('ghs_x', 'moi/repo', 7);
    assert.deepStrictEqual(f.manque, ['approbation du CEO sur la PR', 'agents/revue au vert', 'agents/securite au vert']);
    srv.etat.avis.push({ user: { login: 'entreprise-agents[bot]', type: 'Bot' }, state: 'APPROVED' });
    srv.etat.statuts.push({ context: 'agents/revue', state: 'success' }, { context: 'agents/securite', state: 'failure' });
    f = await gh.fusionnable('ghs_x', 'moi/repo', 7);
    assert.deepStrictEqual(f.manque, ['approbation du CEO sur la PR', 'agents/securite au vert'], 'l\'approbation d\'un bot ne compte pas');
    srv.etat.avis.push({ user: { login: 'radhouenchbinou', type: 'User' }, state: 'APPROVED' });
    srv.etat.statuts.unshift({ context: 'agents/securite', state: 'success' });
    f = await gh.fusionnable('ghs_x', 'moi/repo', 7);
    assert.deepStrictEqual(f.manque, []);
  } finally { srv.close(); delete process.env.GITHUB_GIT_URL; }
});

test('adresse GitHub : github.com, GitHub Enterprise Cloud (ghe.com) et Server', () => {
  const { hote } = require('../lib/github');
  assert.deepStrictEqual([hote('').api, hote('https://github.com/').git], ['https://api.github.com', 'https://github.com']);
  const c = hote('https://Acme.ghe.com');
  assert.deepStrictEqual([c.type, c.api, c.git, c.domaines], ['ghe.com', 'https://api.acme.ghe.com', 'https://acme.ghe.com', ['acme.ghe.com', 'api.acme.ghe.com', '*.acme.ghe.com']]);
  const s = hote('https://github.entreprise.fr');
  assert.deepStrictEqual([s.type, s.api, s.domaines], ['serveur', 'https://github.entreprise.fr/api/v3', ['github.entreprise.fr']]);
  assert.throws(() => hote('http://github.entreprise.fr'), /https/);
  assert.throws(() => hote('https://x.fr/chemin'), /Adresse GitHub/);
});
