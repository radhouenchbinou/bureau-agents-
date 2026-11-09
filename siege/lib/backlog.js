// Backlog en deux collections : « features » (demandes et ajouts) et « bugs » (anomalies remontées par les testeurs).
// Chaque collection a un schéma déclaratif, utilisé pour valider, pour le fichier local et pour Notion (lib/notion.js).
// Une source expose : lister(), creer(e), modifier(id, champs), supprimer(id).
'use strict';
const fsp = require('fs').promises, path = require('path');

const ETAPES = ['0 · Cadrage', '1 · Spécification', '2 · Conception', '3 · Plan de tests', '4 · Développement',
  '5 · Recette', '6 · Revue de code', '7 · Sécurité', '8 · Livraison', '9 · Documentation'];
const ID_FEATURE = /^[A-Z]{3}-\d{3}$/;

// type : titre | texte | choix | liste ; libelle = nom de la propriété Notion
const COLLECTIONS = {
  features: {
    libelle: 'Features', format: ID_FEATURE, exemple: 'COL-001',
    champs: {
      titre: { type: 'titre', libelle: 'Titre', requis: true, max: 200 },
      rang: { type: 'nombre', libelle: 'Rang' },
      filiale: { type: 'choix', libelle: 'Filiale', libre: true },
      jalon: { type: 'choix', libelle: 'Jalon', libre: true },
      statut: { type: 'choix', libelle: 'Statut', options: ['À faire', 'Spécifiée', 'En cours', 'En revue', 'Bloqué', 'Livré'], defaut: 'À faire' },
      priorite: { type: 'choix', libelle: 'Priorité', options: ['Haute', 'Moyenne', 'Basse'], defaut: 'Moyenne' },
      etape: { type: 'choix', libelle: 'Étape', options: ETAPES },
      dependances: { type: 'liste', libelle: 'Dépend de', format: ID_FEATURE },
      // Feature sur plusieurs filiales : un ticket parent (souvent GRP) et un ticket enfant par filiale, livrés ensemble
      parent: { type: 'texte', libelle: 'Parent', max: 7, format: ID_FEATURE },
      // Pull request du ticket (« owner/repo#12 ») : tenue par siege/github.js seulement
      pr: { type: 'texte', libelle: 'PR', max: 160, auto: true, format: /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}#\d{1,7}$/ },
      description: { type: 'texte', libelle: 'Description', max: 4000 },
      agent: { type: 'texte', libelle: 'Agent', max: 60 }
    },
    colonnes: 'statut'
  },
  bugs: {
    libelle: 'Bugs', format: /^BUG-\d{3}$/, exemple: 'BUG-001',
    champs: {
      titre: { type: 'titre', libelle: 'Titre', requis: true, max: 200 },
      rang: { type: 'nombre', libelle: 'Rang' },
      filiale: { type: 'choix', libelle: 'Filiale', libre: true },
      story:{ type: 'texte', libelle: 'Story', max: 7, format: ID_FEATURE },
      gravite: { type: 'choix', libelle: 'Gravité', options: ['Bloquant', 'Majeur', 'Mineur'], defaut: 'Majeur' },
      statut: { type: 'choix', libelle: 'Statut', options: ['Ouvert', 'En correction', 'À vérifier', 'Fermé', 'Rejeté'], defaut: 'Ouvert' },
      reproduction: { type: 'texte', libelle: 'Reproduction', max: 4000 },
      attendu: { type: 'texte', libelle: 'Attendu', max: 1500 },
      obtenu: { type: 'texte', libelle: 'Obtenu', max: 1500 },
      detecte_par: { type: 'texte', libelle: 'Détecté par', max: 60 },
      corrige_par: { type: 'texte', libelle: 'Corrigé par', max: 60 }
    },
    colonnes: 'statut'
  }
};

class ErreurBacklog extends Error {}
const refus = m => { throw new ErreurBacklog(m); };
const texte = (s, max) => (typeof s === 'string' ? s : s == null ? '' : String(s)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const col = nom => COLLECTIONS[nom] || refus('Collection inconnue : ' + nom);

// Normalise un élément partiel ; `strict` = création (id et champs requis, valeurs par défaut)
function valider(nom, e, { strict = false } = {}) {
  const c = col(nom);
  if (!e || typeof e !== 'object') refus('Élément manquant');
  const out = {};
  if ('id' in e || strict) { if (!c.format.test(e.id || '')) refus('Identifiant attendu au format ' + c.exemple); out.id = e.id; }
  for (const [k, d] of Object.entries(c.champs)) {
    if (!(k in e) && !(strict && (d.requis || d.defaut))) continue;
    const v = e[k];
    if (d.type === 'titre' || d.type === 'texte') {
      out[k] = texte(v, d.max || 200);
      if (d.requis && !out[k]) refus(d.libelle + ' vide');
      if (d.format && out[k] && !d.format.test(out[k])) refus(d.libelle + ' invalide : ' + out[k]);
    } else if (d.type === 'choix') {
      out[k] = texte(v, 80) || d.defaut || '';
      if (out[k] && d.options && !d.options.includes(out[k])) refus(d.libelle + ' inconnu(e) : ' + out[k]);
    } else if (d.type === 'nombre') {
      if (v === '' || v == null) { out[k] = null; continue; }
      const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 99999) refus(d.libelle + ' : entier entre 1 et 99999');
      out[k] = n;
    } else if (d.type === 'liste') {
      const l = Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/);
      out[k] = [...new Set(l.map(x => String(x).trim()).filter(Boolean))];
      for (const x of out[k]) if (d.format && !d.format.test(x)) refus(d.libelle + ' invalide : ' + x);
    }
  }
  return out;
}

// Élément vide complet (tous les champs), pour un affichage et un stockage homogènes
function complet(nom, e) {
  const out = { id: e.id };
  for (const [k, d] of Object.entries(col(nom).champs)) out[k] = k in e ? e[k] : d.type === 'liste' ? [] : d.type === 'nombre' ? null : (d.defaut || '');
  if (e.notion) out.notion = e.notion;
  if (e.jira) out.jira = e.jira;
  return out;
}

// Une feature est « prête » quand toutes ses dépendances sont livrées
// Une dépendance est satisfaite quand le ticket est livré. Exception : un enfant qui dépend de son parent (feature
// multi-filiales) attend seulement que la conception du parent soit validée (étape ≥ 3), car le parent n'est livré
// qu'après ses enfants.
function prete(e, features) {
  const parId = new Map(features.map(x => [x.id, x]));
  return (e.dependances || []).every(d => {
    const x = parId.get(d); if (!x) return false;
    if (x.statut === 'Livré') return true;
    return d === e.parent && parseInt(x.etape, 10) >= 3;
  });
}

// Ordre de priorité : rang croissant (1 = le plus urgent), sans rang à la fin, puis identifiant
const parRang = (a, b) => (a.rang || Infinity) - (b.rang || Infinity) || a.id.localeCompare(b.id);
const GRAVITE = { Bloquant: 0, Majeur: 1, Mineur: 2 };
const OUVERT = b => ['Ouvert', 'En correction', 'À vérifier'].includes(b.statut);

// File de travail unique, dans l'ordre où le directeur doit traiter les tickets :
// 1. bugs bloquants ouverts ; 2. features prêtes (dépendances livrées) non livrées ; 3. autres bugs ouverts (gravité puis rang).
// Les features dont une dépendance n'est pas livrée sont listées à part, « en attente ».
function file(features, bugs) {
  const bloquants = bugs.filter(b => OUVERT(b) && b.gravite === 'Bloquant').sort(parRang);
  const actives = features.filter(f => f.statut !== 'Livré');
  const pretes = actives.filter(f => prete(f, features)).sort(parRang);
  const autres = bugs.filter(b => OUVERT(b) && b.gravite !== 'Bloquant').sort((a, b) => GRAVITE[a.gravite] - GRAVITE[b.gravite] || parRang(a, b));
  return {
    ordre: [...bloquants.map(x => ({ collection: 'bugs', ...x })), ...pretes.map(x => ({ collection: 'features', ...x })), ...autres.map(x => ({ collection: 'bugs', ...x }))],
    enAttente: actives.filter(f => !prete(f, features)).sort(parRang)
  };
}

// Rangs 1..n réattribués dans l'ordre donné (après un glisser-déposer) ; renvoie seulement les changements
function reclasser(elements, ids) {
  const pos = new Map(ids.map((id, i) => [id, i + 1]));
  return elements.filter(e => pos.has(e.id) && e.rang !== pos.get(e.id)).map(e => ({ id: e.id, rang: pos.get(e.id) }));
}

// Prochain identifiant libre : préfixe de filiale (features) ou BUG (bugs)
function prochainId(nom, existants, prefixe) {
  const p = nom === 'bugs' ? 'BUG' : prefixe;
  if (!/^[A-Z]{3}$/.test(p || '')) refus('Préfixe attendu (3 lettres)');
  const n = Math.max(0, ...existants.map(x => x.id).filter(id => id.startsWith(p + '-')).map(id => Number(id.slice(4)) || 0));
  return p + '-' + String(n + 1).padStart(3, '0');
}

// ---------- Commentaires de suivi et questions ----------
// Un commentaire : { date, auteur, type: 'suivi' | 'question' | 'reponse', texte }.
// Dans Notion, le type et l'auteur sont portés par un préfixe lisible : « [Question] (qa) … » ; un commentaire
// écrit à la main par le CEO, sans préfixe, est une réponse.
const TYPES_COMMENTAIRE = ['suivi', 'question', 'reponse'];
const ETIQUETTE = { suivi: 'Suivi', question: 'Question', reponse: 'Réponse' };
const AUTEUR = /^[a-z][a-z0-9-]{1,40}$|^CEO$/;

function commentaire({ auteur = 'CEO', type = 'suivi', texte }) {
  if (!TYPES_COMMENTAIRE.includes(type)) refus('Type de commentaire : suivi, question ou reponse');
  if (!AUTEUR.test(auteur)) refus('Auteur : nom d\'agent (ex. dev-backend) ou CEO');
  const t = texte_(texte, 1800); if (!t) refus('Commentaire vide');
  return { auteur, type, texte: t };
}
const texte_ = (s, max) => (typeof s === 'string' ? s : '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const enLigne = c => `[${ETIQUETTE[c.type]}] (${c.auteur}) ${c.texte}`;
function depuisLigne(txt, { humain = false, date = '' } = {}) {
  const m = /^\[(Suivi|Question|Réponse)\]\s*\(([^)]{1,41})\)\s*([\s\S]*)$/.exec(txt || '');
  if (m) return { date, auteur: m[2], type: Object.keys(ETIQUETTE).find(k => ETIQUETTE[k] === m[1]), texte: m[3] };
  return { date, auteur: humain ? 'CEO' : 'inconnu', type: 'reponse', texte: txt || '' };
}
// La dernière question d'agent est « ouverte » tant qu'aucune réponse du CEO ne l'a suivie
function questionOuverte(fil) {
  let q = null;
  for (const c of fil) { if (c.type === 'question' && c.auteur !== 'CEO') q = c; else if (c.auteur === 'CEO' && q) q = null; }
  return q;
}

class CommentairesFichier {
  constructor(fichier) { this.fichier = fichier; this.file = Promise.resolve(); }
  async tous() { try { return JSON.parse(await fsp.readFile(this.fichier, 'utf8')) || {}; } catch (e) { if (e.code === 'ENOENT') return {}; throw new ErreurBacklog('commentaires.json illisible'); } }
  async lister(id) { return (await this.tous())[id] || []; }
  ajouter(id, c) {
    const v = { date: new Date().toISOString(), ...commentaire(c) };
    const r = this.file.then(async () => {
      const t = await this.tous(); (t[id] = t[id] || []).push(v);
      const tmp = this.fichier + '.' + process.pid + '.tmp';
      await fsp.mkdir(path.dirname(this.fichier), { recursive: true });
      await fsp.writeFile(tmp, JSON.stringify(t, null, 2) + '\n'); await fsp.rename(tmp, this.fichier);
      return v;
    });
    this.file = r.catch(() => {});
    return r;
  }
}

class SourceFichier {
  constructor(nom, fichier) {
    col(nom); this.collection = nom; this.fichier = fichier; this.type = 'fichier'; this.file = Promise.resolve();
    this.notes = new CommentairesFichier(path.join(path.dirname(fichier), 'commentaires.json'));
  }
  async commentaires(id) { return this.notes.lister(id); }
  async commenter(id, c) { if (!(await this.lire()).some(x => x.id === id)) refus('Ticket introuvable : ' + id); return this.notes.ajouter(id, c); }
  async lire() {
    try { const j = JSON.parse(await fsp.readFile(this.fichier, 'utf8')); return Array.isArray(j.elements) ? j.elements : []; }
    catch (e) { if (e.code === 'ENOENT') return []; throw new ErreurBacklog(path.basename(this.fichier) + ' illisible : ' + e.message); }
  }
  // Écritures sérialisées et atomiques
  ecrire(maj) {
    const r = this.file.then(async () => {
      const els = await this.lire(), res = maj(els);
      const tmp = this.fichier + '.' + process.pid + '.tmp';
      await fsp.mkdir(path.dirname(this.fichier), { recursive: true });
      await fsp.writeFile(tmp, JSON.stringify({ version: 1, collection: this.collection, elements: els }, null, 2) + '\n');
      await fsp.rename(tmp, this.fichier);
      return res;
    });
    this.file = r.catch(() => {});
    return r;
  }
  async lister() { return (await this.lire()).map(e => complet(this.collection, e)); }
  creer(e) {
    const v = valider(this.collection, e, { strict: true });
    return this.ecrire(els => { if (els.some(x => x.id === v.id)) refus('Identifiant déjà utilisé : ' + v.id); const n = complet(this.collection, v); els.push(n); return n; });
  }
  modifier(id, champs) {
    const v = valider(this.collection, champs); delete v.id;
    return this.ecrire(els => { const x = els.find(y => y.id === id) || refus('Élément introuvable : ' + id); Object.assign(x, v); return complet(this.collection, x); });
  }
  supprimer(id) {
    return this.ecrire(els => { const i = els.findIndex(y => y.id === id); if (i < 0) refus('Élément introuvable : ' + id); els.splice(i, 1); });
  }
}

module.exports = { COLLECTIONS, ETAPES, ID_FEATURE, ErreurBacklog, valider, complet, prete, file, reclasser, parRang, prochainId, SourceFichier,
  commentaire, enLigne, depuisLigne, questionOuverte, TYPES_COMMENTAIRE };
