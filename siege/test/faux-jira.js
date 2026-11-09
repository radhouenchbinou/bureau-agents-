// Faux Jira pour les tests : Cloud (Basic e-mail:jeton, /search/jql à jeton de page) ou Data Center (Bearer, /search).
// Projet, types, champs personnalisés, écran par défaut, issues, transitions, commentaires ; JQL limitée à ce que
// le Siège envoie (étiquette, type, projet).
'use strict';
const http = require('http');

function demarrer({ mode = 'cloud', jeton = 'jira-jeton-de-test-0123456789', email = 'ceo@exemple.fr', ecranManquant = [] } = {}) {
  const champs = [{ id: 'summary', name: 'Résumé', custom: false }, { id: 'customfield_10001', name: 'Story points', custom: true }];
  let numero = 0; const issues = [], commentaires = new Map(), ecran = new Set(), appels = [];
  const types = [{ id: '10001', name: 'Story' }, { id: '10004', name: 'Bug' }, { id: '10002', name: 'Tâche' }];
  const statuts = ['À faire', 'En cours', 'Terminé'];
  const moi = mode === 'cloud' ? { accountId: 'bot-1', displayName: 'Intégration Siège' } : { name: 'siege', key: 'siege', displayName: 'Intégration Siège' };
  const attendu = mode === 'cloud' ? 'Basic ' + Buffer.from(email + ':' + jeton).toString('base64') : 'Bearer ' + jeton;
  const filtre = jql => {
    const lab = /labels = "([^"]+)"/.exec(jql), typ = /issuetype = "([^"]+)"/.exec(jql), prj = /project = "([^"]+)"/.exec(jql);
    return issues.filter(i => (!lab || i.fields.labels.includes(lab[1])) && (!typ || i.fields.issuetype.name === typ[1]) && (!prj || i.key.startsWith(prj[1] + '-')));
  };
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      const u = new URL(req.url, 'http://x'), corps = b ? JSON.parse(b) : {}, ok = (code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(j === undefined ? '' : JSON.stringify(j)); };
      appels.push(req.method + ' ' + u.pathname);
      if (req.headers.authorization !== attendu) return ok(401, { errorMessages: ['Non authentifié'] });
      let m;
      if (u.pathname === '/rest/api/2/myself') return ok(200, moi);
      if ((m = /^\/rest\/api\/2\/project\/([A-Z0-9_]+)$/.exec(u.pathname))) return m[1] === 'PROJ' ? ok(200, { key: 'PROJ', issueTypes: types }) : ok(404, { errorMessages: ['Projet introuvable'] });
      if (u.pathname === '/rest/api/2/field' && req.method === 'GET') return ok(200, champs);
      if (u.pathname === '/rest/api/2/field' && req.method === 'POST') { const f = { id: 'customfield_' + (10100 + champs.length), name: corps.name, custom: true, schema: { custom: corps.type } }; champs.push(f); return ok(201, f); }
      if ((m = /^\/rest\/api\/2\/screens\/addToDefault\/(.+)$/.exec(u.pathname))) { ecran.add(m[1]); return ok(200, {}); }
      if ((m = /^\/rest\/api\/2\/issue\/createmeta\/PROJ\/issuetypes\/(\d+)$/.exec(u.pathname))) {
        const l = [...ecran].filter(id => !ecranManquant.includes((champs.find(c => c.id === id) || {}).name)).map(fieldId => ({ fieldId }));
        return ok(200, mode === 'cloud' ? { fields: [{ fieldId: 'summary' }, ...l] } : { values: [{ fieldId: 'summary' }, ...l] });
      }
      if (mode === 'cloud' && u.pathname === '/rest/api/2/search/jql') {
        const l = filtre(corps.jql), debut = Number(corps.nextPageToken || 0), taille = Math.min(corps.maxResults || 50, 2);   // pages de 2 pour tester la pagination
        const fin = debut + taille < l.length; return ok(200, { issues: l.slice(debut, debut + taille), ...(fin ? { nextPageToken: String(debut + taille) } : {}), isLast: !fin });
      }
      if (mode === 'dc' && u.pathname === '/rest/api/2/search') { const l = filtre(corps.jql), d = corps.startAt || 0; return ok(200, { issues: l.slice(d, d + 2), total: l.length, startAt: d }); }
      if (u.pathname === '/rest/api/2/issue' && req.method === 'POST') {
        const f = corps.fields, inconnus = Object.keys(f).filter(k => k.startsWith('customfield_') && !ecran.has(k));
        if (inconnus.length) return ok(400, { errors: Object.fromEntries(inconnus.map(k => [k, 'Field cannot be set. It is not on the appropriate screen, or unknown.'])) });
        const t = types.find(x => x.name === f.issuetype.name);
        const i = { key: f.project.key + '-' + (++numero), fields: { ...f, issuetype: t, status: { name: statuts[0] }, labels: f.labels || [] } };
        issues.push(i); return ok(201, { key: i.key, id: String(issues.length) });
      }
      const issue = (m = /^\/rest\/api\/2\/issue\/([A-Z]+-\d+)/.exec(u.pathname)) && issues.find(i => i.key === m[1]);
      if (m && !issue) return ok(404, { errorMessages: ['Issue introuvable'] });
      if (issue && /\/comment$/.test(u.pathname) && req.method === 'POST') {
        const c = { id: String(Date.now()), body: corps.body, author: moi, created: new Date().toISOString() }; (commentaires.get(issue.key) || commentaires.set(issue.key, []).get(issue.key)).push(c); return ok(201, c);
      }
      if (issue && /\/comment$/.test(u.pathname)) { const l = commentaires.get(issue.key) || [], d = Number(u.searchParams.get('startAt') || 0); return ok(200, { comments: l.slice(d, d + 2), total: l.length, startAt: d }); }
      if (issue && /\/transitions$/.test(u.pathname) && req.method === 'GET') return ok(200, { transitions: statuts.map((s, k) => ({ id: String(11 + k), name: 'Vers ' + s, to: { name: s } })) });
      if (issue && /\/transitions$/.test(u.pathname)) { issue.fields.status = { name: statuts[Number(corps.transition.id) - 11] }; return ok(204); }
      if (issue && req.method === 'PUT') {
        if (corps.fields) Object.assign(issue.fields, corps.fields);
        for (const l of (corps.update && corps.update.labels) || []) if (l.remove) issue.fields.labels = issue.fields.labels.filter(x => x !== l.remove);
        return ok(204);
      }
      ok(404, { errorMessages: ['route ' + req.method + ' ' + u.pathname] });
    });
  });
  srv.etat = { champs, issues, commentaires, ecran, appels };
  // Commentaire d'un humain (le CEO répond dans Jira)
  srv.repondre = (cle, body) => (commentaires.get(cle) || commentaires.set(cle, []).get(cle)).push({ id: 'h' + Date.now(), body, author: mode === 'cloud' ? { accountId: 'ceo-42' } : { name: 'ceo' }, created: new Date().toISOString() });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}
module.exports = { demarrer };
