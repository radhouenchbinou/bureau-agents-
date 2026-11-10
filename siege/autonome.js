#!/usr/bin/env node
// Mode autonome : boucle du directeur sur le backlog.
//   node siege/autonome.js --portfolio <dossier portfolio>            → simulation : ticket suivant et criticité, rien n'est écrit
//   node siege/autonome.js --portfolio <dossier portfolio> --lancer   → exécute (max N tickets, défaut 1)
// Sans --lancer, aucune instance n'est créée et le backlog n'est pas modifié. Aucune fusion dans ce lot.
'use strict';
const path = require('path');
const { SourceFichier } = require('./lib/backlog');
const { boucleParallele, choisir } = require('./lib/autonome');
const { lancerClaude } = require('./lib/lanceur');
const pub = require('./lib/publication');
const revue = require('./lib/revue');
const crit = require('./lib/criticite');

const RACINE = path.resolve(__dirname, '..');

function options(argv) {
  const o = { lancer: false, max: 1, portfolio: '', repo: '', instances: path.join(RACINE, '.claude', 'worktrees') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lancer') o.lancer = true;
    else if (a === '--max') o.max = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === '--portfolio') o.portfolio = argv[++i] || '';
    else if (a === '--instances') o.instances = path.resolve(argv[++i] || o.instances);
    else if (a === '--repo') o.repo = argv[++i] || '';
    else throw new Error('option inconnue : ' + a);
  }
  if (!o.portfolio) throw new Error('--portfolio <dossier> obligatoire');
  return o;
}

// Jetons GitHub par rôle (app de l'entreprise, restreints au repo) : dev pour la PR, reviewer pour les feux, devops pour la fusion.
// Un jeton d'installation dure une heure : une exécution longue doit être relancée.
async function liaisonGithub(repo) {
  const gh = require('./lib/github'), garde = require('./lib/garde');
  const c = gh.config(RACINE), politique = garde.charger(RACINE);
  const [jDev, jRev, jDevops] = await Promise.all(['dev-backend', 'reviewer', 'devops'].map(r => gh.jetonRole(c, politique, r, repo)));
  return {
    publier: pub.publier({ jeton: jDev, repo }),
    poser: pub.poserFeux({ jeton: jRev, repo }),
    fusionner: pub.fusionner({ jeton: jDevops, repo }),
    revoir: ({ ticket, dossier }) => revue.revoir({ lancer: lancerClaude, dossier, ticket }),
  };
}

async function main(argv) {
  const o = options(argv);
  const features = new SourceFichier('features', path.join(o.portfolio, 'features.json'));
  const bugs = new SourceFichier('bugs', path.join(o.portfolio, 'bugs.json'));
  const charger = async () => ({ features: await features.lister(), bugs: await bugs.lister() });

  if (!o.lancer) {
    const { features: f, bugs: b } = await charger();
    const t = choisir(f, b);
    if (!t) return console.log('Rien à faire : aucun ticket prêt dans la file.');
    const c = crit.evaluer({ action: t.titre });
    console.log(`Simulation (rien n'est écrit) : prochain ticket ${t.id} « ${t.titre} » — criticité ${c.taux} % (${c.motif}).`);
    console.log(`Pour exécuter : node siege/autonome.js --portfolio ${o.portfolio} --lancer --max ${o.max}`);
    return;
  }

  // Branchement GitHub : sans --repo, les instances tournent mais ne publient ni ne fusionnent (lot 1 et 2)
  const liaison = o.repo ? await liaisonGithub(o.repo) : {};
  const bilan = await boucleParallele({
    charger, src: features, racine: RACINE, base: o.instances, max: o.max,
    runner: async ({ ticket, dossier }) => lancerClaude({ dossier, ticket }),
    journal: e => console.log('Terminé :', JSON.stringify(e)),
    ...liaison,
  });
  for (const b of bilan) console.log(JSON.stringify(b));
}

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error('Erreur : ' + (e.message || e)); process.exit(1); });
module.exports = { main, options };
