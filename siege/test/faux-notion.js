// Faux serveur de l'API Notion pour les tests : bases, pages (query avec filtre ID), commentaires, corbeille.
'use strict';
const http = require('http'), crypto = require('crypto');

function demarrer() {
  const bases = new Map(), pages = new Map(), commentaires = new Map(), appels = [];
  const id = () => crypto.randomUUID();
  const texte = l => (l || []).map(t => t.text.content).join('');
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x'), corps = b ? JSON.parse(b) : {}, ok = (code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
      appels.push(req.method + ' ' + u.pathname);
      if (req.headers.authorization !== 'Bearer ntn_testtesttesttesttesttest') return ok(401, { code: 'unauthorized', message: 'API token is invalid.' });
      if (!req.headers['notion-version']) return ok(400, { message: 'Notion-Version manquant' });
      let m;
      if (req.method === 'POST' && u.pathname === '/databases') {
        const d = { id: id(), properties: corps.properties, parent: corps.parent }; bases.set(d.id, d); return ok(200, { object: 'database', id: d.id, url: 'https://notion.so/' + d.id });
      }
      if ((req.method === 'GET' || req.method === 'PATCH') && (m = /^\/databases\/([^/]+)$/.exec(u.pathname))) {
        const d = bases.get(m[1]); if (!d) return ok(404, { message: 'Could not find database' });
        if (req.method === 'PATCH') Object.assign(d.properties, corps.properties || {});
        return ok(200, { object: 'database', id: d.id, properties: d.properties });
      }
      if (req.method === 'POST' && (m = /^\/databases\/([^/]+)\/query$/.exec(u.pathname))) {
        if (!bases.has(m[1])) return ok(404, { message: 'Could not find database' });
        let l = [...pages.values()].filter(p => p.parent.database_id === m[1] && !p.archived);
        if (corps.filter) l = l.filter(p => texte(p.properties.ID.rich_text) === corps.filter.rich_text.equals);
        const debut = Number(corps.start_cursor || 0), taille = corps.page_size || 100, tranche = l.slice(debut, debut + taille);
        return ok(200, { results: tranche, has_more: debut + taille < l.length, next_cursor: debut + taille < l.length ? String(debut + taille) : null });
      }
      if (req.method === 'POST' && u.pathname === '/pages') {
        const p = { id: id(), url: 'https://notion.so/p', parent: corps.parent, properties: corps.properties, archived: false }; pages.set(p.id, p); return ok(200, p);
      }
      if (req.method === 'PATCH' && (m = /^\/pages\/([^/]+)$/.exec(u.pathname))) {
        const p = pages.get(m[1]); if (!p) return ok(404, { message: 'introuvable' });
        if (corps.properties) Object.assign(p.properties, corps.properties); if ('archived' in corps) p.archived = corps.archived; return ok(200, p);
      }
      if (req.method === 'POST' && u.pathname === '/comments') {
        const c = { id: id(), rich_text: corps.rich_text.map(t => ({ ...t, plain_text: t.text.content })), created_time: new Date().toISOString(), created_by: { type: 'bot' } };
        (commentaires.get(corps.parent.page_id) || commentaires.set(corps.parent.page_id, []).get(corps.parent.page_id)).push(c); return ok(200, c);
      }
      if (req.method === 'GET' && u.pathname === '/comments') return ok(200, { results: commentaires.get(u.searchParams.get('block_id')) || [], has_more: false });
      ok(404, { message: 'route inconnue ' + u.pathname });
    });
  });
  // Commentaire écrit à la main dans Notion par une personne
  srv.commenterEnHumain = (pageId, txt) => commentaires.get(pageId).push({ rich_text: [{ plain_text: txt }], created_time: new Date().toISOString(), created_by: { type: 'person' } });
  srv.etat = { bases, pages, commentaires, appels };
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

module.exports = { demarrer, JETON: 'ntn_testtesttesttesttesttest' };
