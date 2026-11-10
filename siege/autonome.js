#!/usr/bin/env node
// Mode autonome : boucle du directeur sur le backlog.
//   node siege/autonome.js --portfolio <dossier portfolio>            → simulation : ticket suivant et criticité, rien n'est écrit
//   node siege/autonome.js --portfolio <dossier portfolio> --lancer   → exécute (max N tickets, défaut 1)
// Sans --lancer, aucune instance n'est créée et le backlog n'est pas modifié. Aucune fusion dans ce lot.
'use strict';
const path = require('path'), os = require('os');
const { SourceFichier } = require('./lib/backlog');
const { boucle, choisir } = require('./lib/autonome');
const { lancerClaude } = require('./lib/lanceur');
const crit = require('./lib/criticite');

const RACINE = path.resolve(__dirname, '..');

function options(argv) {
  const o = { lancer: false, max: 1, portfolio: '', instances: path.join(os.homedir(), '.siege', 'instances') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lancer') o.lancer = true;
    else if (a === '--max') o.max = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === '--portfolio') o.portfolio = argv[++i] || '';
    else if (a === '--instances') o.instances = argv[++i] || o.instances;
    else throw new Error('option inconnue : ' + a);
  }
  if (!o.portfolio) throw new Error('--portfolio <dossier> obligatoire');
  return o;
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

  const bilan = await boucle({
    charger, src: features, racine: RACINE, base: o.instances, max: o.max,
    runner: async ({ ticket, dossier }) => lancerClaude({ dossier, ticket }),
    journal: e => console.log('Terminé :', JSON.stringify(e)),
  });
  for (const b of bilan) console.log(JSON.stringify(b));
}

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error('Erreur : ' + (e.message || e)); process.exit(1); });
module.exports = { main, options };
