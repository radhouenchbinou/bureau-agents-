// Source « Jira » du backlog, Jira Cloud (…atlassian.net, e-mail + jeton d'API) ou Data Center / Server (jeton personnel).
// L'entreprise d'agents ne voit que ses tickets, parmi tous les tableaux de l'entreprise :
//   Features = type Story + étiquette bureau-ia ; Bugs = type Bug + étiquette bureau-ia.
// L'identifiant du Siège (COL-001, BUG-001) fait foi : il est gardé dans le champ « Siège ID » ; la clé Jira est un lien.
// Les champs du Siège (Statut, Étape, Filiale…) sont des champs personnalisés « Siège … » créés par initialiser().
// API REST v2 (même format sur Cloud et Data Center) ; recherche /search/jql sur Cloud, /search sur Data Center.
'use strict';
const { COLLECTIONS, ErreurBacklog, valider, complet, parRang, commentaire, enLigne, depuisLigne } = require('./backlog');

const URL_OK = /^(https:\/\/[A-Za-z0-9.-]+(:\d{2,5})?|http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?)(\/[A-Za-z0-9._~\/-]*)?$/;
const ETIQUETTE = /^[A-Za-z0-9_.-]{1,50}$/, PROJET = /^[A-Z][A-Z0-9_]{1,19}$/, TYPE = /^[\p{L}\p{N} _-]{1,40}$/u;
const PREFIXE = 'Siège ';
const CF = {   // types de champs personnalisés Jira (identiques sur Cloud et Data Center)
  texte: ['com.atlassian.jira.plugin.system.customfieldtypes:textfield', 'com.atlassian.jira.plugin.system.customfieldtypes:textsearcher'],
  long: ['com.atlassian.jira.plugin.system.customfieldtypes:textarea', 'com.atlassian.jira.plugin.system.customfieldtypes:textsearcher'],
  nombre: ['com.atlassian.jira.plugin.system.customfieldtypes:float', 'com.atlassian.jira.plugin.system.customfieldtypes:exactnumber']
};

// Champs Jira du Siège, communs aux deux collections (même libellé = même champ) : { libelle: 'texte'|'long'|'nombre' }
function champsSiege() {
  const out = { ID: 'texte' };
  for (const c of Object.values(COLLECTIONS)) for (const [k, d] of Object.entries(c.champs)) {
    if (d.type === 'titre' || k === 'description') continue;   // résumé et description natifs de Jira
    out[d.libelle] = d.type === 'nombre' ? 'nombre' : d.max > 255 ? 'long' : out[d.libelle] === 'long' ? 'long' : 'texte';
  }
  return out;
}

// Description : texte (API v2) ou document ADF (si un champ revient au format v3) → texte brut
function texte(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const parcours = n => !n ? '' : n.type === 'text' ? n.text || '' : (n.content || []).map(parcours).join(n.type === 'doc' ? '\n' : n.type === 'paragraph' ? '' : '');
  return typeof v === 'object' ? parcours(v) : String(v);
}

function verifierConfig(c) {
  if (!c || !URL_OK.test(c.url || '')) throw new ErreurBacklog('Jira : adresse attendue en https (ex. https://entreprise.atlassian.net)');
  if (!['cloud', 'dc'].includes(c.mode)) throw new ErreurBacklog('Jira : mode cloud ou dc (Data Center / Server)');
  if (c.mode === 'cloud' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || '')) throw new ErreurBacklog('Jira Cloud : e-mail du compte du jeton attendu');
  if (!PROJET.test(c.projet || '')) throw new ErreurBacklog('Jira : clé de projet attendue (ex. PROJ), où les tickets sont créés');
  if (!ETIQUETTE.test(c.etiquette || '')) throw new ErreurBacklog('Jira : étiquette sans espace (ex. bureau-ia)');
  for (const n of Object.keys(COLLECTIONS)) if (!TYPE.test((c.types || {})[n] || '')) throw new ErreurBacklog('Jira : type de ticket manquant pour ' + COLLECTIONS[n].libelle);
  return c;
}

class ClientJira {
  constructor(c, jeton) {
    verifierConfig(c);
    if (!jeton) throw new ErreurBacklog('Jeton Jira manquant : variable JIRA_TOKEN ou réglage du Siège');
    this.c = c; this.base = c.url.replace(/\/+$/, '');
    this.auth = c.mode === 'cloud' ? 'Basic ' + Buffer.from(c.email + ':' + jeton).toString('base64') : 'Bearer ' + jeton;
  }
  async appel(methode, chemin, corps, essai = 0) {
    let r;
    try {
      r = await fetch(this.base + chemin, { method: methode, signal: AbortSignal.timeout(20e3), redirect: 'error', body: corps ? JSON.stringify(corps) : undefined,
        headers: { Authorization: this.auth, Accept: 'application/json', 'Content-Type': 'application/json', 'X-Atlassian-Token': 'no-check' } });
    } catch (e) { throw new ErreurBacklog('Jira injoignable : ' + (e.cause && e.cause.code || e.message)); }
    if ((r.status === 429 || r.status >= 500) && essai < 3) {
      const s = Math.min(30, Number(r.headers.get('retry-after')) || 2 ** essai);
      await new Promise(ok => setTimeout(ok, s * 1e3)); return this.appel(methode, chemin, corps, essai + 1);
    }
    if (r.status === 204) return {};
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = [...(j.errorMessages || []), ...Object.entries(j.errors || {}).map(([k, v]) => k + ' : ' + v)].join(' ; ');
      throw new ErreurBacklog('Jira ' + r.status + ' : ' + (detail || j.message || 'erreur'));
    }
    return j;
  }
  // Toutes les issues d'une requête JQL (pagination propre à Cloud et à Data Center)
  async chercher(jql, fields) {
    const out = [];
    if (this.c.mode === 'cloud') {
      let jeton;
      do {
        const j = await this.appel('POST', '/rest/api/2/search/jql', { jql, fields, maxResults: 100, ...(jeton ? { nextPageToken: jeton } : {}) });
        out.push(...(j.issues || [])); jeton = j.isLast === false || (j.nextPageToken && j.isLast !== true) ? j.nextPageToken : null;
      } while (jeton);
    } else {
      let debut = 0, total = 1;
      while (debut < total) {
        const j = await this.appel('POST', '/rest/api/2/search', { jql, fields, startAt: debut, maxResults: 100 });
        out.push(...(j.issues || [])); total = j.total || 0; debut += (j.issues || []).length; if (!(j.issues || []).length) break;
      }
    }
    return out;
  }
  async moi() { return this.moiP || (this.moiP = this.appel('GET', '/rest/api/2/myself')); }
}

class SourceJira {
  constructor({ config: c, jeton, collection }) {
    if (!COLLECTIONS[collection]) throw new ErreurBacklog('Collection inconnue : ' + collection);
    this.client = new ClientJira(c, jeton); this.c = c; this.collection = collection; this.type = 'jira'; this.cache = null; this.cacheA = 0;
    const manque = Object.keys(champsSiege()).filter(l => !/^customfield_\d+$/.test((c.champs || {})[l] || ''));
    if (manque.length) throw new ErreurBacklog('Jira non initialisé (champs ' + manque.map(l => PREFIXE + l).join(', ') + ') : lancez l\'initialisation depuis le Siège');
    this.sansId = 0;
  }
  cf(libelle) { return this.c.champs[libelle]; }
  jql() {
    return `labels = "${this.c.etiquette}" AND issuetype = "${this.c.types[this.collection]}"` + (this.c.restreindre ? ` AND project = "${this.c.projet}"` : '') + ' ORDER BY created ASC';
  }
  fields() { return ['summary', 'description', 'labels', ...Object.values(this.c.champs)]; }

  versJira(e) {
    const champs = COLLECTIONS[this.collection].champs, f = {};
    if ('id' in e) f[this.cf('ID')] = e.id;
    for (const [k, d] of Object.entries(champs)) {
      if (!(k in e)) continue;
      const v = e[k];
      if (d.type === 'titre') f.summary = v;
      else if (k === 'description') f.description = v || null;
      else if (d.type === 'nombre') f[this.cf(d.libelle)] = v == null ? null : v;
      else if (d.type === 'liste') f[this.cf(d.libelle)] = (v || []).join(', ') || null;
      else f[this.cf(d.libelle)] = v || null;
    }
    return f;
  }
  depuisJira(i) {
    const f = i.fields || {}, e = { id: texte(f[this.cf('ID')]).trim() };
    for (const [k, d] of Object.entries(COLLECTIONS[this.collection].champs)) {
      if (d.type === 'titre') e[k] = f.summary || '';
      else if (k === 'description') e[k] = texte(f.description);
      else {
        const v = f[this.cf(d.libelle)];
        e[k] = d.type === 'nombre' ? (typeof v === 'number' ? v : null) : d.type === 'liste' ? texte(v).split(/[\s,;]+/).filter(Boolean) : texte(v) || d.defaut || '';
      }
    }
    e.jira = { cle: i.key, url: this.client.base + '/browse/' + i.key };
    return complet(this.collection, e);
  }

  async lister() {
    if (this.cache && Date.now() - this.cacheA < 10e3) return this.cache;
    const issues = await this.client.chercher(this.jql(), this.fields()), out = [], vus = new Set(), fmt = COLLECTIONS[this.collection].format;
    this.sansId = 0;
    // Une issue étiquetée sans identifiant du Siège (créée à la main dans Jira) n'est pas reprise : elle est comptée
    for (const i of issues) { const e = this.depuisJira(i); if (!fmt.test(e.id) || vus.has(e.id)) { this.sansId++; continue; } vus.add(e.id); out.push(e); }
    out.sort(parRang);
    this.cache = out; this.cacheA = Date.now();
    return out;
  }
  async issue(id) {
    this.cache = null;
    const e = (await this.lister()).find(x => x.id === id);
    if (!e) throw new ErreurBacklog('Ticket introuvable dans Jira : ' + id);
    return e;
  }
  async creer(e) {
    const v = valider(this.collection, e, { strict: true });
    if ((await this.lister()).some(x => x.id === v.id)) throw new ErreurBacklog('Identifiant déjà utilisé : ' + v.id);
    const r = await this.client.appel('POST', '/rest/api/2/issue', { fields: {
      project: { key: this.c.projet }, issuetype: { name: this.c.types[this.collection] }, labels: [this.c.etiquette], ...this.versJira(complet(this.collection, v)) } });
    this.cache = null;
    const statut = v.statut ? await this.transition(r.key, v.statut) : null;
    return { ...complet(this.collection, v), jira: { cle: r.key, url: this.client.base + '/browse/' + r.key }, ...(statut ? { transition: statut } : {}) };
  }
  async modifier(id, champs) {
    const v = valider(this.collection, champs); delete v.id;
    const e = await this.issue(id);
    await this.client.appel('PUT', `/rest/api/2/issue/${e.jira.cle}`, { fields: this.versJira(v) });
    this.cache = null;
    const statut = v.statut ? await this.transition(e.jira.cle, v.statut) : null;
    return { ...e, ...v, ...(statut ? { transition: statut } : {}) };
  }
  // Retirer un ticket du Siège n'efface rien dans Jira : on enlève seulement l'étiquette (l'issue reste à l'équipe)
  async supprimer(id) {
    const e = await this.issue(id);
    await this.client.appel('PUT', `/rest/api/2/issue/${e.jira.cle}`, { update: { labels: [{ remove: this.c.etiquette }] } });
    this.cache = null;
  }
  // Le statut du Siège est le champ « Siège Statut » ; en plus, si le workflow du projet a une transition vers un
  // statut du même nom (ou celui donné dans config.statuts), on la fait pour que le tableau Jira suive. Jamais bloquant.
  async transition(cle, statut) {
    const cible = String((this.c.statuts || {})[statut] || statut).toLowerCase();
    try {
      const t = ((await this.client.appel('GET', `/rest/api/2/issue/${cle}/transitions`)).transitions || [])
        .find(x => (x.to && String(x.to.name).toLowerCase() === cible) || String(x.name).toLowerCase() === cible);
      if (!t) return 'aucune transition Jira vers « ' + cible + ' »';
      await this.client.appel('POST', `/rest/api/2/issue/${cle}/transitions`, { transition: { id: t.id } });
      return 'statut Jira : ' + (t.to ? t.to.name : t.name);
    } catch (e) { return 'transition non faite : ' + e.message; }
  }
  async commentaires(id) {
    const e = await this.issue(id), moi = await this.client.moi(), out = [];
    const estMoi = a => a && (a.accountId ? a.accountId === moi.accountId : (a.name || a.key) === (moi.name || moi.key));
    let debut = 0, total = 1;
    while (debut < total) {
      const j = await this.client.appel('GET', `/rest/api/2/issue/${e.jira.cle}/comment?startAt=${debut}&maxResults=100&orderBy=created`);
      const l = j.comments || []; total = j.total || 0; debut += l.length; if (!l.length) break;
      for (const c of l) out.push(depuisLigne(texte(c.body), { humain: !estMoi(c.author), date: c.created || '' }));
    }
    return out;
  }
  async commenter(id, c) {
    const v = commentaire(c), e = await this.issue(id);
    const r = await this.client.appel('POST', `/rest/api/2/issue/${e.jira.cle}/comment`, { body: enLigne(v) });
    return { date: r.created || new Date().toISOString(), ...v };
  }
}

// Initialisation (droits d'administration Jira nécessaires pour créer des champs) : vérifie l'accès, le projet et ses types,
// crée les champs « Siège … » manquants, les ajoute à l'écran par défaut, puis vérifie qu'ils sont saisissables à la création.
// Ne supprime ni ne modifie rien d'existant. Renvoie la config complétée et la liste de ce qui reste à faire par un admin.
async function initialiser(c, jeton) {
  const cl = new ClientJira(c, jeton), moi = await cl.moi(), avertissements = [], crees = [];
  const p = await cl.appel('GET', `/rest/api/2/project/${encodeURIComponent(c.projet)}`);
  const types = new Map((p.issueTypes || []).map(t => [String(t.name).toLowerCase(), t]));
  for (const n of Object.keys(COLLECTIONS)) if (!types.has(c.types[n].toLowerCase()))
    throw new ErreurBacklog(`Le projet ${c.projet} n'a pas le type « ${c.types[n]} » (types : ${(p.issueTypes || []).map(t => t.name).join(', ')})`);
  const existants = new Map((await cl.appel('GET', '/rest/api/2/field')).filter(f => f.custom).map(f => [f.name, f.id])), champs = {};
  for (const [libelle, type] of Object.entries(champsSiege())) {
    const nom = PREFIXE + libelle;
    if (existants.has(nom)) { champs[libelle] = existants.get(nom); continue; }
    const f = await cl.appel('POST', '/rest/api/2/field', { name: nom, description: 'Champ de l\'entreprise d\'agents (Siège). Ne pas renommer.', type: CF[type][0], searcherKey: CF[type][1] });
    champs[libelle] = f.id; crees.push(nom);
    try { await cl.appel('POST', `/rest/api/2/screens/addToDefault/${f.id}`); } catch (e) { avertissements.push(`${nom} : non ajouté à l'écran par défaut (${e.message})`); }
  }
  // Champs réellement disponibles à la création, pour chaque type (écrans propres au projet)
  for (const n of Object.keys(COLLECTIONS)) {
    try {
      const t = types.get(c.types[n].toLowerCase());
      const m = await cl.appel('GET', `/rest/api/2/issue/createmeta/${encodeURIComponent(c.projet)}/issuetypes/${t.id}?maxResults=200`);
      const dispo = new Set((m.values || m.fields || []).map(x => x.fieldId || x.key));
      const absents = Object.entries(champs).filter(([, id]) => !dispo.has(id)).map(([l]) => PREFIXE + l);
      if (absents.length) avertissements.push(`${c.types[n]} : à ajouter aux écrans de création et d'édition du projet ${c.projet} par un admin Jira : ${absents.join(', ')}`);
    } catch (e) { avertissements.push(`Vérification des écrans de ${c.types[n]} impossible (${e.message})`); }
  }
  return { config: { ...c, champs }, moi: moi.displayName || moi.name || moi.emailAddress || '', crees, avertissements };
}

module.exports = { SourceJira, ClientJira, initialiser, verifierConfig, champsSiege, texte, PREFIXE };
