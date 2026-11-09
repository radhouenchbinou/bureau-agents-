// Source « Notion » du backlog : une base Notion par collection (Features, Bugs), une page par ticket.
// API REST officielle (https://api.notion.com/v1), jeton d'intégration interne, sans dépendance npm.
// Le schéma des propriétés vient de COLLECTIONS (lib/backlog.js) : rien n'est codé deux fois.
'use strict';
const { COLLECTIONS, ErreurBacklog, valider, complet, parRang, commentaire, enLigne, depuisLigne } = require('./backlog');

const VERSION = '2022-06-28';
const BASE = () => process.env.NOTION_API_URL || 'https://api.notion.com/v1';
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const PROP_ID = 'ID';

// Texte → blocs rich_text (Notion limite chaque bloc à 2 000 caractères)
const brut = s => { const t = String(s || ''), out = []; for (let i = 0; i < t.length && out.length < 100; i += 1900) out.push({ type: 'text', text: { content: t.slice(i, i + 1900) } }); return out; };
const plat = l => (Array.isArray(l) ? l : []).map(t => t.plain_text != null ? t.plain_text : (t.text && t.text.content) || '').join('');
const option = s => String(s || '').replace(/,/g, ' ').slice(0, 100);   // Notion refuse les virgules dans une option

// Ticket (champs présents seulement) → propriétés Notion
function versNotion(nom, e) {
  const champs = COLLECTIONS[nom].champs, p = {};
  if ('id' in e) p[PROP_ID] = { rich_text: brut(e.id) };
  for (const [k, d] of Object.entries(champs)) {
    if (!(k in e)) continue;
    const v = e[k];
    if (d.type === 'titre') p[d.libelle] = { title: brut(v) };
    else if (d.type === 'texte') p[d.libelle] = { rich_text: brut(v) };
    else if (d.type === 'choix') p[d.libelle] = { select: v ? { name: option(v) } : null };
    else if (d.type === 'nombre') p[d.libelle] = { number: v == null ? null : v };
    else if (d.type === 'liste') p[d.libelle] = { rich_text: brut((v || []).join(', ')) };
  }
  return p;
}
// Page Notion → ticket
function depuisNotion(nom, page) {
  const pr = page.properties || {}, e = { id: plat((pr[PROP_ID] || {}).rich_text) };
  for (const [k, d] of Object.entries(COLLECTIONS[nom].champs)) {
    const v = pr[d.libelle] || {};
    if (d.type === 'titre') e[k] = plat(v.title);
    else if (d.type === 'texte') e[k] = plat(v.rich_text);
    else if (d.type === 'choix') e[k] = (v.select && v.select.name) || d.defaut || '';
    else if (d.type === 'nombre') e[k] = typeof v.number === 'number' ? v.number : null;
    else if (d.type === 'liste') e[k] = plat(v.rich_text).split(/[\s,;]+/).filter(Boolean);
  }
  e.notion = { page: page.id, url: page.url };
  return complet(nom, e);
}

// Propriétés de la base créée pour une collection ; filiales et jalons deviennent des options
function schema(nom, { filiales = [], jalons = [] } = {}) {
  const p = { [PROP_ID]: { rich_text: {} } }, opts = l => ({ select: { options: [...new Set(l.map(option))].filter(Boolean).map(name => ({ name })) } });
  for (const [k, d] of Object.entries(COLLECTIONS[nom].champs)) {
    if (d.type === 'titre') p[d.libelle] = { title: {} };
    else if (d.type === 'texte' || d.type === 'liste') p[d.libelle] = { rich_text: {} };
    else if (d.type === 'nombre') p[d.libelle] = { number: { format: 'number' } };
    else if (d.type === 'choix') p[d.libelle] = opts(d.options || (k === 'filiale' ? filiales : k === 'jalon' ? jalons : []));
  }
  return p;
}

class ClientNotion {
  constructor(jeton) { if (!jeton) throw new ErreurBacklog('Jeton Notion manquant : variable NOTION_TOKEN ou réglage du Siège'); this.jeton = jeton; }
  async appel(methode, chemin, corps, essai = 0) {
    let r;
    try {
      r = await fetch(BASE() + chemin, { method: methode, signal: AbortSignal.timeout(20e3), body: corps ? JSON.stringify(corps) : undefined,
        headers: { Authorization: 'Bearer ' + this.jeton, 'Notion-Version': VERSION, 'Content-Type': 'application/json' } });
    } catch (e) { throw new ErreurBacklog('Notion injoignable : ' + (e.cause && e.cause.code || e.message)); }
    if ((r.status === 429 || r.status >= 500) && essai < 3) {
      const s = Math.min(30, Number(r.headers.get('retry-after')) || 2 ** essai);
      await new Promise(ok => setTimeout(ok, s * 1e3)); return this.appel(methode, chemin, corps, essai + 1);
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErreurBacklog('Notion ' + r.status + ' : ' + (j.message || j.code || 'erreur'));
    return j;
  }
}

class SourceNotion {
  constructor({ jeton, base, collection }) {
    if (!COLLECTIONS[collection]) throw new ErreurBacklog('Collection inconnue : ' + collection);
    if (!UUID.test(base || '')) throw new ErreurBacklog('Base Notion « ' + COLLECTIONS[collection].libelle + ' » non configurée');
    this.client = new ClientNotion(jeton); this.base = base; this.collection = collection; this.type = 'notion'; this.cache = null; this.cacheA = 0; this.schemaOk = null;
  }
  // Une base créée avant l'ajout d'un champ (ex. Parent, PR) le reçoit à la première écriture ; rien n'est retiré
  schemaAJour() {
    return this.schemaOk || (this.schemaOk = (async () => {
      const d = await this.client.appel('GET', `/databases/${this.base}`), existe = new Set(Object.keys(d.properties || {}));
      const manque = Object.fromEntries(Object.entries(schema(this.collection)).filter(([k, v]) => !existe.has(k) && !v.title));
      if (Object.keys(manque).length) await this.client.appel('PATCH', `/databases/${this.base}`, { properties: manque });
    })().catch(e => { this.schemaOk = null; throw e; }));
  }
  async lister() {
    if (this.cache && Date.now() - this.cacheA < 10e3) return this.cache;
    const out = []; let curseur;
    do {
      const j = await this.client.appel('POST', `/databases/${this.base}/query`, { page_size: 100, ...(curseur ? { start_cursor: curseur } : {}) });
      for (const p of j.results || []) if (!p.archived && !p.in_trash) out.push(depuisNotion(this.collection, p));
      curseur = j.has_more ? j.next_cursor : null;
    } while (curseur);
    out.sort(parRang);
    this.cache = out; this.cacheA = Date.now();
    return out;
  }
  async pages(id) {
    const j = await this.client.appel('POST', `/databases/${this.base}/query`, { filter: { property: PROP_ID, rich_text: { equals: id } }, page_size: 2 });
    return (j.results || []).filter(x => !x.archived && !x.in_trash);
  }
  async page(id) { const p = await this.pages(id); if (!p.length) throw new ErreurBacklog('Ticket introuvable dans Notion : ' + id); return p[0]; }
  async creer(e) {
    const v = valider(this.collection, e, { strict: true });
    await this.schemaAJour();
    if ((await this.pages(v.id)).length) throw new ErreurBacklog('Identifiant déjà utilisé : ' + v.id);
    const p = await this.client.appel('POST', '/pages', { parent: { database_id: this.base }, properties: versNotion(this.collection, complet(this.collection, v)) });
    this.cache = null; return depuisNotion(this.collection, p);
  }
  async modifier(id, champs) {
    const v = valider(this.collection, champs); delete v.id;
    await this.schemaAJour();
    const p = await this.page(id);
    const r = await this.client.appel('PATCH', `/pages/${p.id}`, { properties: versNotion(this.collection, v) });
    this.cache = null; return depuisNotion(this.collection, r);
  }
  async supprimer(id) {
    const p = await this.page(id);
    await this.client.appel('PATCH', `/pages/${p.id}`, { archived: true });   // corbeille Notion : récupérable
    this.cache = null;
  }
  // Commentaires de la page du ticket (l'intégration doit avoir les droits « lire » et « insérer » des commentaires)
  async commentaires(id) {
    const p = await this.page(id), out = []; let curseur;
    do {
      const j = await this.client.appel('GET', `/comments?block_id=${p.id}&page_size=100${curseur ? '&start_cursor=' + encodeURIComponent(curseur) : ''}`);
      for (const c of j.results || []) out.push(depuisLigne(plat(c.rich_text), { humain: !!(c.created_by && c.created_by.type === 'person'), date: c.created_time || '' }));
      curseur = j.has_more ? j.next_cursor : null;
    } while (curseur);
    return out;
  }
  async commenter(id, c) {
    const v = commentaire(c), p = await this.page(id);
    const r = await this.client.appel('POST', '/comments', { parent: { page_id: p.id }, rich_text: brut(enLigne(v)) });
    return { date: r.created_time || new Date().toISOString(), ...v };
  }
}

// Crée les bases Features et Bugs sous une page partagée avec l'intégration
async function creerBases({ jeton, pageParente, filiales, jalons }) {
  if (!UUID.test(pageParente || '')) throw new ErreurBacklog('Identifiant de page Notion invalide');
  const client = new ClientNotion(jeton), bases = {};
  for (const nom of Object.keys(COLLECTIONS)) {
    const j = await client.appel('POST', '/databases', {
      parent: { type: 'page_id', page_id: pageParente }, is_inline: true,
      title: [{ type: 'text', text: { content: COLLECTIONS[nom].libelle } }], properties: schema(nom, { filiales, jalons })
    });
    bases[nom] = j.id;
  }
  return bases;
}

// Identifiant (avec tirets) depuis une URL Notion ou un identifiant collé
function idDepuisLien(s) {
  const t = String(s || '').split(/[?#]/)[0].replace(/-/g, ''), m = t.match(/([0-9a-f]{32})$/i) || t.match(/([0-9a-f]{32})/i);
  return m ? m[1].toLowerCase().replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5') : '';
}

module.exports = { SourceNotion, ClientNotion, creerBases, versNotion, depuisNotion, schema, idDepuisLien, UUID };
