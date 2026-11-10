'use strict';
// EIA-017, interface : section « Journal » de la fiche d'un agent (public/journal-agent.js), testée avec un faux DOM.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const { section } = require('../public/journal-agent');

// ---------- Faux DOM minimal (même contrat que h() / vider() de app.js) ----------
class Noeud {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.enfants = []; this.ecouteurs = {}; this.focus_ = 0; }
  get texte() { return this.enfants.map(c => typeof c === 'string' ? c : c.texte).join(''); }
  focus() { this.focus_++; }
  clic() { (this.ecouteurs.click || []).forEach(f => f({})); }
}
function h(tag, p, ...enfants) {
  const el = new Noeud(tag);
  for (const [k, v] of Object.entries(p || {})) {
    if (v == null || v === false) continue;
    if (k === 'text') el.enfants.push(String(v));
    else if (k.startsWith('on')) (el.ecouteurs[k.slice(2)] ||= []).push(v);
    else el.attrs[k] = v === true ? '' : v;
  }
  for (const c of enfants.flat()) if (c != null && c !== false) el.enfants.push(c instanceof Noeud ? c : String(c));
  return el;
}
const vider = (el, ...c) => { el.enfants = c.flat().filter(Boolean); return el; };
const tous = (n, f, out = []) => { if (!(n instanceof Noeud)) return out; if (f(n)) out.push(n); n.enfants.forEach(c => tous(c, f, out)); return out; };
const bouton = (n, txt) => tous(n, x => x.tag === 'button' && x.texte.includes(txt))[0];
const attendre = () => new Promise(r => setImmediate(r));

const entree = (i, o = {}) => ({
  id: 'id' + i, role: 'dev-backend', filiale: 'Entreprise IA', ticket: 'EIA-017', etape: '4 · Développement', moteur: 'claude', modele: 'm1',
  debut: new Date(Date.UTC(2026, 10, 9, 12, 0, 0) - i * 3600e3).toISOString(), fin: new Date(Date.UTC(2026, 10, 9, 12, 2, 5) - i * 3600e3).toISOString(),
  duree: 125, etat: 'terminé', code: 0, extrait: 'sortie ' + i, tronque: false, evenements: [], ...o
});
// Faux serveur : pages de la liste donnée, comme GET /api/agents/<role>/journal
const serveur = (liste, extra = {}) => { const appels = []; return { appels, lire: async (depuis, nombre) => { appels.push([depuis, nombre]); return { entrees: liste.slice(depuis, depuis + nombre), total: liste.length, suite: depuis + nombre < liste.length, ignorees: 0, erreur_ecriture: null, ...extra }; } }; };
const monter = (lire, opts = {}) => section('dev-backend', { h, vider, lire, ouvrirTicket: opts.ouvrirTicket, ticketConnu: opts.ticketConnu });
const lignes = racine => tous(racine, n => n.attrs.class === 'jr-entree');

test('CA10 : les entrées gardent l\'ordre reçu (du plus récent au plus ancien)', async () => {
  const s = serveur([entree(0), entree(1), entree(2)]), r = monter(s.lire); await attendre();
  const l = lignes(r);
  assert.strictEqual(l.length, 3);
  const dates = l.map(x => tous(x, n => n.tag === 'time')[0].attrs.datetime);
  assert.deepStrictEqual(dates, [...dates].sort().reverse());
});

test('chaque entrée montre ticket, étape, moteur/modèle, durée, état et code', async () => {
  const r = monter(serveur([entree(0)]).lire); await attendre();
  const t = lignes(r)[0].texte;
  for (const x of ['EIA-017', '4 · Développement', 'claude', 'm1', '2 min 5 s', 'terminé', '0']) assert.ok(t.includes(x), x);
});

test('entrée en cours : pas de durée ni de code inventés', async () => {
  const r = monter(serveur([entree(0, { etat: 'en cours', fin: undefined, duree: undefined, code: null })]).lire); await attendre();
  const t = lignes(r)[0].texte;
  assert.ok(t.includes('en cours'));
  assert.ok(!t.includes('NaN') && !t.includes('undefined') && !t.includes('null'));
});

test('CA11 : 45 entrées, 20 puis 20 puis 5, le bouton disparaît', async () => {
  const s = serveur(Array.from({ length: 45 }, (_, i) => entree(i))), r = monter(s.lire); await attendre();
  assert.strictEqual(lignes(r).length, 20);
  bouton(r, 'Charger plus').clic(); await attendre();
  assert.strictEqual(lignes(r).length, 40);
  bouton(r, 'Charger plus').clic(); await attendre();
  assert.strictEqual(lignes(r).length, 45);
  assert.strictEqual(bouton(r, 'Charger plus'), undefined);
  assert.deepStrictEqual(s.appels, [[0, 20], [20, 20], [40, 20]]);
});

test('L4 : exactement 20 entrées, pas de « Charger plus »', async () => {
  const r = monter(serveur(Array.from({ length: 20 }, (_, i) => entree(i))).lire); await attendre();
  assert.strictEqual(lignes(r).length, 20);
  assert.strictEqual(bouton(r, 'Charger plus'), undefined);
});

test('CA12 : agent jamais lancé, message sans erreur', async () => {
  const r = monter(serveur([]).lire); await attendre();
  assert.ok(r.texte.includes('Aucun journal pour cet agent'));
  assert.strictEqual(lignes(r).length, 0);
  assert.strictEqual(bouton(r, 'Réessayer'), undefined);
});

test('état de chargement annoncé (role=status) puis retiré', async () => {
  let fin; const r = monter(() => new Promise(ok => { fin = ok; }));
  const st = tous(r, n => n.attrs.role === 'status')[0];
  assert.ok(st && st.texte.includes('Chargement'));
  assert.ok(!r.texte.includes('Aucun journal'));
  fin({ entrees: [], total: 0, suite: false, ignorees: 0, erreur_ecriture: null }); await attendre();
  assert.ok(!r.texte.includes('Chargement'));
});

test('erreur de chargement : message et « Réessayer » qui relance', async () => {
  let n = 0; const ok = serveur([entree(0)]);
  const r = monter((d, k) => ++n === 1 ? Promise.reject(new Error('HTTP 500')) : ok.lire(d, k)); await attendre();
  assert.ok(r.texte.includes('Journal indisponible'));
  assert.ok(tous(r, x => x.attrs.role === 'alert').length >= 1);
  bouton(r, 'Réessayer').clic(); await attendre();
  assert.strictEqual(lignes(r).length, 1);
  assert.ok(!r.texte.includes('Journal indisponible'));
});

test('échec de « Charger plus » : entrées déjà affichées conservées', async () => {
  const s = serveur(Array.from({ length: 30 }, (_, i) => entree(i))); let n = 0;
  const r = monter((d, k) => ++n === 2 ? Promise.reject(new Error('x')) : s.lire(d, k)); await attendre();
  bouton(r, 'Charger plus').clic(); await attendre();
  assert.strictEqual(lignes(r).length, 20);
  assert.ok(bouton(r, 'Réessayer'));
  bouton(r, 'Réessayer').clic(); await attendre();
  assert.strictEqual(lignes(r).length, 30);
});

test('bandeau d\'erreur d\'écriture du journal, même sans entrée', async () => {
  const r = monter(serveur([], { erreur_ecriture: { date: '2026-11-09T10:00:00Z', erreur: 'EROFS : lecture seule' } }).lire); await attendre();
  const b = tous(r, n => /bandeau/.test(n.attrs.class || ''))[0];
  assert.ok(b && b.texte.includes('Écriture') && b.texte.includes('EROFS'));
  assert.ok(r.texte.includes('Aucun journal pour cet agent'));
});

test('pas de bandeau sans erreur d\'écriture', async () => {
  const r = monter(serveur([entree(0)]).lire); await attendre();
  assert.strictEqual(tous(r, n => /bandeau/.test(n.attrs.class || '')).length, 0);
});

test('lignes ignorées signalées', async () => {
  const r = monter(serveur([entree(0)], { ignorees: 2 }).lire); await attendre();
  assert.ok(r.texte.includes('2 ligne'));
});

test('CA13 : extrait, motifs et champs insérés en texte, jamais en HTML', async () => {
  const xss = '<script>alert(1)</script>', ev = { date: '2026-11-09T10:00:00Z', nature: 'refus', outil: 'Bash', motif: '<img src=x onerror=alert(1)>', raison: '', exception: '' };
  const r = monter(serveur([entree(0, { extrait: xss, etape: '<b>x</b>', evenements: [ev] })]).lire); await attendre();
  assert.ok(r.texte.includes(xss) && r.texte.includes('<img src=x onerror=alert(1)>'));
  assert.strictEqual(tous(r, n => ['script', 'img', 'b'].includes(n.tag)).length, 0);
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'journal-agent.js'), 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src));
});

test('détail repliable (details/summary natifs) avec extrait et événements de garde', async () => {
  const ev = [{ date: '2026-11-09T10:00:00Z', nature: 'refus', outil: 'Bash', motif: 'npm install left-pad', raison: '', exception: 'EXC-007', incertain: true },
    { date: '2026-11-09T10:05:00Z', nature: 'exception_activee', outil: '', motif: '', raison: '', exception: 'EXC-007' }];
  const r = monter(serveur([entree(0, { extrait: 'fin de sortie', evenements: ev })]).lire); await attendre();
  const d = tous(r, n => n.tag === 'details')[0];
  assert.ok(d && tous(d, n => n.tag === 'summary').length === 1);
  for (const x of ['fin de sortie', 'npm install left-pad', 'EXC-007', 'incertain']) assert.ok(d.texte.includes(x), x);
  assert.strictEqual(tous(d, n => n.tag === 'li').length, 2);
});

test('détail vide : mention explicite', async () => {
  const r = monter(serveur([entree(0, { extrait: '', evenements: [] })]).lire); await attendre();
  assert.ok(tous(r, n => n.tag === 'details')[0].texte.includes('Aucune sortie'));
});

test('CA19 : sans ticket, « — » et aucun lien', async () => {
  const r = monter(serveur([entree(0, { ticket: '' })]).lire, { ouvrirTicket() {} }); await attendre();
  const l = lignes(r)[0];
  assert.ok(l.texte.includes('—'));
  assert.strictEqual(tous(l, n => n.tag === 'a' || (n.tag === 'button' && /EIA|BUG/.test(n.texte))).length, 0);
});

test('ticket connu : bouton natif qui ouvre le ticket ; inconnu : texte simple', async () => {
  const ouverts = [];
  const r = monter(serveur([entree(0), entree(1, { ticket: 'EIA-099' })]).lire, { ouvrirTicket: id => ouverts.push(id), ticketConnu: id => id === 'EIA-017' }); await attendre();
  const [a, b] = lignes(r);
  const lien = bouton(a, 'EIA-017'); assert.ok(lien && lien.attrs.type === 'button');
  lien.clic(); assert.deepStrictEqual(ouverts, ['EIA-017']);
  assert.strictEqual(bouton(b, 'EIA-099'), undefined);
  assert.ok(b.texte.includes('EIA-099'));
});

test('accessibilité : boutons natifs type=button, aucun div cliquable', async () => {
  const r = monter(serveur(Array.from({ length: 25 }, (_, i) => entree(i))).lire); await attendre();
  assert.ok(tous(r, n => n.tag === 'button').every(b => b.attrs.type === 'button'));
  assert.strictEqual(tous(r, n => n.tag !== 'button' && n.ecouteurs.click).length, 0);
  assert.ok(tous(r, n => n.tag === 'h4' || n.tag === 'h3').length >= 1);
});
