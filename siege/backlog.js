#!/usr/bin/env node
// Backlog en ligne de commande : l'outil des agents (et du CEO) pour lire et faire vivre Features et Bugs,
// que le backlog soit dans des fichiers locaux ou dans Notion. Même code que l'interface du Siège.
'use strict';
const cfg = require('./lib/config');
const { COLLECTIONS, ErreurBacklog, file, prochainId, prete, questionOuverte } = require('./lib/backlog');

// Tickets actifs (pas encore livrés ou fermés) dont la dernière question d'agent attend le CEO
const ACTIFS = ['Spécifiée', 'En cours', 'En revue', 'Bloqué', 'Ouvert', 'En correction', 'À vérifier'];
async function questionsOuvertes() {
  const out = [];
  for (const n of Object.keys(COLLECTIONS)) {
    const src = cfg.source(n);
    for (const e of (await src.lister()).filter(x => ACTIFS.includes(x.statut))) {
      const q = questionOuverte(await src.commentaires(e.id)); if (q) out.push({ collection: n, id: e.id, titre: e.titre, question: q });
    }
  }
  return out;
}
const { creerBases, idDepuisLien } = require('./lib/notion');
const jira = require('./lib/jira');
const { filiales } = require('./lib/registre');

const AIDE = `Backlog du Siège — usage : node siege/backlog.js <commande> [options]

Lecture
  file                                  ordre de traitement (bugs bloquants, features prêtes, autres bugs)
  liste [features|bugs] [--filiale X] [--statut Y]
  voir <ID>                             un ticket en détail (feature ABC-001 ou bug BUG-001)

Intégration (CEO) :
  jira-init --url https://… --mode cloud|dc [--email …] --projet PROJ [--etiquette bureau-ia] [--type-feature Story] [--type-bug Bug] [--restreindre]
  importer                              copie les tickets locaux dans Notion ou Jira

Écriture (champs : --titre --rang --filiale --jalon --statut --priorite --etape --dependances --parent --description --agent
          bugs : --story --gravite --reproduction --attendu --obtenu --detecte-par --corrige-par)
  creer feature --filiale <Nom> --titre "…" [champs]     identifiant attribué automatiquement
  creer bug --filiale <Nom> --story ABC-001 --titre "…" --gravite Bloquant|Majeur|Mineur [champs]
  maj <ID> [champs]                     ex. maj COL-002 --statut "En cours" --etape "4 · Développement" --agent dev-backend
  supprimer <ID>                        (Notion : mis à la corbeille)

Commentaires (sur la page Notion du ticket, ou en local)
  commenter <ID> --auteur <agent> --texte "…" [--question]   suivi d'avancement, ou question au CEO
  commentaires <ID>                     le fil du ticket
  questions                             questions des agents encore sans réponse du CEO

Notion
  source                                où vit le backlog, et état du jeton
  notion-init <URL de la page Notion>   crée les bases Features et Bugs sous cette page et bascule le backlog sur Notion
  importer                              copie les tickets locaux (portfolio/*.json) vers Notion, sans doublon
`;

function options(args) {
  const o = {}, reste = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { const k = args[i].slice(2).replace(/-/g, '_'); o[k] = args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[++i] : ''; }
    else reste.push(args[i]);
  }
  return { o, reste };
}
const collectionDe = id => /^BUG-/.test(id) ? 'bugs' : 'features';
const aff = e => [e.rang ? '#' + e.rang : '  -', e.id, '[' + e.statut + ']', e.gravite ? '(' + e.gravite + ')' : '', e.filiale ? '· ' + e.filiale : '', '—', e.titre].filter(Boolean).join(' ');

async function prefixeDe(nom) {
  const f = (await filiales(cfg.F.filiales)).find(x => x.nom.toLowerCase() === String(nom || '').toLowerCase() || x.prefixe === String(nom || '').toUpperCase());
  if (!f) throw new ErreurBacklog('Filiale inconnue dans portfolio/filiales.md : ' + nom);
  return f;
}

async function main(argv) {
  const [cmd, ...args] = argv, { o, reste } = options(args);
  if ('pr' in o) throw new ErreurBacklog('Le champ PR est tenu par node siege/github.js pr --ticket <ID> (jamais à la main)');
  switch (cmd) {
    case undefined: case 'aide': case '--help': console.log(AIDE); return;
    case 'source': {
      const s = cfg.lireSource();
      console.log(s.type === 'notion' ? `Notion — Features ${s.bases && s.bases.features}, Bugs ${s.bases && s.bases.bugs}`
        : s.type === 'jira' ? `Jira ${s.mode === 'cloud' ? 'Cloud' : 'Data Center'} — ${s.url}, projet ${s.projet}, ${s.types.features} / ${s.types.bugs} étiquetés « ${s.etiquette} »`
        : 'Fichiers locaux (portfolio/features.json, portfolio/bugs.json)');
      console.log('Jeton Notion : ' + (cfg.jeton() ? 'présent' : 'absent') + ' · Jeton Jira : ' + (cfg.jetonJira() ? 'présent' : 'absent'));
      return;
    }
    case 'file': {
      const [f, b] = await Promise.all([cfg.source('features').lister(), cfg.source('bugs').lister()]), r = file(f, b);
      console.log('À traiter, dans l\'ordre :'); r.ordre.forEach((e, i) => console.log(String(i + 1).padStart(3) + '. ' + aff(e)));
      if (r.enAttente.length) { console.log('\nEn attente d\'une dépendance :'); r.enAttente.forEach(e => console.log('     ' + aff(e) + '  ⟵ ' + e.dependances.join(', '))); }
      return;
    }
    case 'liste': {
      const noms = reste[0] ? [reste[0]] : Object.keys(COLLECTIONS);
      for (const n of noms) {
        if (!COLLECTIONS[n]) throw new ErreurBacklog('Collection : features ou bugs');
        let l = await cfg.source(n).lister();
        if (o.filiale) l = l.filter(e => e.filiale.toLowerCase() === o.filiale.toLowerCase());
        if (o.statut) l = l.filter(e => e.statut === o.statut);
        console.log('— ' + COLLECTIONS[n].libelle + ' (' + l.length + ')'); l.forEach(e => console.log('  ' + aff(e)));
      }
      return;
    }
    case 'voir': {
      const id = reste[0], n = collectionDe(id), e = (await cfg.source(n).lister()).find(x => x.id === id);
      if (!e) throw new ErreurBacklog('Ticket introuvable : ' + id);
      if (n === 'features') {
        const toutes = await cfg.source('features').lister(); e.prete = prete(e, toutes);
        const enfants = toutes.filter(x => x.parent === e.id);
        if (enfants.length) e.lot = enfants.map(x => ({ id: x.id, filiale: x.filiale, statut: x.statut, etape: x.etape || '', pr: x.pr || '' }));
      }
      console.log(JSON.stringify(e, null, 2)); return;
    }
    case 'creer': {
      const n = reste[0] === 'bug' ? 'bugs' : reste[0] === 'feature' ? 'features' : null;
      if (!n) throw new ErreurBacklog('creer feature … ou creer bug …');
      const src = cfg.source(n), f = await prefixeDe(o.filiale);
      const id = o.id || prochainId(n, await src.lister(), f.prefixe);
      const e = await src.creer({ ...o, id, filiale: f.nom });
      console.log('Créé : ' + aff(e) + (e.notion ? '\n' + e.notion.url : e.jira ? '\n' + e.jira.url : '')); return;
    }
    case 'maj': {
      const id = reste[0]; if (!id) throw new ErreurBacklog('maj <ID> [champs]');
      const e = await cfg.source(collectionDe(id)).modifier(id, o);
      console.log('Mis à jour : ' + aff(e)); return;
    }
    case 'supprimer': { await cfg.source(collectionDe(reste[0])).supprimer(reste[0]); console.log('Supprimé : ' + reste[0]); return; }
    case 'commenter': {
      const id = reste[0]; if (!id) throw new ErreurBacklog('commenter <ID> --auteur <agent> --texte "…" [--question]');
      const c = await cfg.source(collectionDe(id)).commenter(id, { auteur: o.auteur || 'CEO', type: 'question' in o ? 'question' : o.auteur && o.auteur !== 'CEO' ? 'suivi' : 'reponse', texte: o.texte });
      console.log('Commentaire ajouté sur ' + id + ' : [' + c.type + '] ' + c.texte); return;
    }
    case 'commentaires': {
      const id = reste[0], fil = await cfg.source(collectionDe(id)).commentaires(id);
      if (!fil.length) console.log('Aucun commentaire sur ' + id);
      fil.forEach(c => console.log(`${(c.date || '').slice(0, 16).replace('T', ' ')}  [${c.type}] (${c.auteur}) ${c.texte}`));
      const q = questionOuverte(fil); if (q) console.log('\n⚠ Question en attente de réponse du CEO : ' + q.texte);
      return;
    }
    case 'questions': {
      const q = await questionsOuvertes();
      if (!q.length) console.log('Aucune question en attente.');
      q.forEach(x => console.log(`${x.id} (${x.question.auteur}) : ${x.question.texte}`)); return;
    }
    case 'notion-init': {
      const page = idDepuisLien(reste[0]);
      if (!page) throw new ErreurBacklog('Donnez l\'URL d\'une page Notion partagée avec l\'intégration');
      const s = cfg.lireSource();
      if (s.type === 'notion' && s.bases && !('force' in o)) throw new ErreurBacklog('Notion est déjà configuré (portfolio/source-backlog.json). Ajoutez --force pour recréer des bases.');
      const fil = (await filiales(cfg.F.filiales)).map(f => f.nom), locales = cfg.sourcesLocales();
      const jalons = [...new Set((await locales.features.lister()).map(e => e.jalon).filter(Boolean))];
      const bases = await creerBases({ jeton: cfg.jeton(), pageParente: page, filiales: fil, jalons });
      await cfg.ecrireSource({ ...s, type: 'notion', page, bases });
      console.log('Bases créées dans Notion (Features, Bugs). Le backlog est maintenant dans Notion.\nÉtape suivante : node siege/backlog.js importer'); return;
    }
    case 'jira-init': {
      // Réservé au CEO (la garde ne le permet à aucun agent) ; le Siège › Intégrations fait la même chose
      const c = { type: 'jira', url: o.url, mode: o.mode, email: o.email, projet: o.projet, etiquette: o.etiquette || 'bureau-ia',
        types: { features: o.type_feature || 'Story', bugs: o.type_bug || 'Bug' }, restreindre: 'restreindre' in o };
      const r = await jira.initialiser(jira.verifierConfig(c), cfg.jetonJira());
      const { bases, page } = cfg.lireSource(); await cfg.ecrireSource({ ...r.config, ...(bases ? { bases, page } : {}) });
      console.log(`Jira prêt (connecté en tant que ${r.moi}). Champs créés : ${r.crees.join(', ') || 'aucun (déjà là)'}`);
      for (const a of r.avertissements) console.log('  ⚠ ' + a);
      console.log('Étape suivante : node siege/backlog.js importer'); return;
    }
    case 'importer': {
      if (!['notion', 'jira'].includes(cfg.lireSource().type)) throw new ErreurBacklog('Le backlog est en fichiers locaux : branchez d\'abord Notion ou Jira');
      const locales = cfg.sourcesLocales();
      for (const n of Object.keys(COLLECTIONS)) {
        const cible = cfg.source(n), deja = new Set((await cible.lister()).map(e => e.id)); let k = 0;
        for (const e of await locales[n].lister()) { if (deja.has(e.id)) continue; const { notion, jira: j, ...sans } = e; await cible.creer(sans); k++; }
        console.log(COLLECTIONS[n].libelle + ' : ' + k + ' ticket(s) importé(s)');
      }
      return;
    }
    default: throw new ErreurBacklog('Commande inconnue : ' + cmd + '\n\n' + AIDE);
  }
}

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e instanceof ErreurBacklog ? 'Erreur : ' + e.message : e); process.exit(1); });
module.exports = { main, questionsOuvertes, ACTIFS };
