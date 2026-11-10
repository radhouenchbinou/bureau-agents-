'use strict';
// Mode autonome, lot 1 : criticité, worktrees par instance, boucle du directeur, rapport par tâche aboutie
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const crit = require('../lib/criticite');
const wt = require('../lib/worktrees');
const { boucle } = require('../lib/autonome');
const { SourceFichier } = require('../lib/backlog');

function depot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-auto-'));
  const r = path.join(d, 'repo');
  fs.mkdirSync(r);
  const g = a => execFileSync('git', ['-C', r, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { stdio: 'pipe' });
  execFileSync('git', ['init', '-q', '-b', 'main', r]);
  fs.writeFileSync(path.join(r, 'README.md'), 'x\n');
  g(['add', '.']); g(['commit', '-q', '-m', 'init']);
  return { d, r, base: path.join(d, 'instances') };
}

test('criticité : fichiers critiques et actions de fusion à 100 %, le modèle ne peut pas abaisser', () => {
  assert.strictEqual(crit.evaluer({ fichiers: ['siege/garde.js'] }).taux, 100);
  assert.strictEqual(crit.evaluer({ fichiers: ['projets/x/siege/github.js'] }).taux, 100);
  assert.strictEqual(crit.evaluer({ action: 'fusionner la PR' }).taux, 100);
  assert.strictEqual(crit.evaluer({ fichiers: ['siege/garde.js'], avisModele: { exception: true, taux: 10 } }).taux, 100);
  assert.strictEqual(crit.evaluer({ fichiers: ['lib/nouveau.js'] }).taux, crit.BASE);
  assert.strictEqual(crit.evaluer({ fichiers: ['lib/nouveau.js'], avisModele: { exception: true, taux: 95 } }).taux, 95);
  assert.ok(!crit.enAttente(90), 'à 90 % pile, pas d\'attente');
  assert.ok(crit.enAttente(91), 'au-delà de 90 %, attente');
});

test('worktrees : une branche par instance, refus des noms hors feature/ et fix/', () => {
  const { r, base } = depot();
  const dossier = wt.creer({ racine: r, base, id: 'eia-001-a', branche: 'feature/eia-001' });
  assert.ok(fs.existsSync(dossier));
  assert.ok(wt.lister(r).some(w => w.branche === 'feature/eia-001'));
  assert.throws(() => wt.creer({ racine: r, base, id: 'x1', branche: 'main' }), /branche refusée/);
  assert.throws(() => wt.creer({ racine: r, base, id: '../x', branche: 'feature/x' }), /identifiant/);
  fs.writeFileSync(path.join(dossier, 'nouveau.txt'), 'y');
  assert.deepStrictEqual(wt.fichiersModifies(dossier), ['nouveau.txt']);
  wt.supprimer({ racine: r, base, id: 'eia-001-a' });
  assert.ok(!fs.existsSync(dossier));
});

async function fixture(tickets) {
  const { d, r, base } = depot();
  const fichier = path.join(d, 'features.json');
  const src = new SourceFichier('features', fichier);
  for (const t of tickets) await src.creerAvecId('EIA', { titre: t.titre, rang: t.rang, filiale: 'Entreprise IA', statut: 'À faire', dependances: [] });
  const charger = async () => ({ features: await src.lister(), bugs: [] });
  return { r, base, src, charger };
}

test('boucle : ticket sans risque, instance dans son worktree, rapport écrit, pas de fusion', async () => {
  const { r, base, src, charger } = await fixture([{ titre: 'Ajouter une page', rang: 1 }]);
  const bilan = await boucle({
    charger, src, racine: r, base, max: 1,
    runner: async ({ dossier }) => { fs.writeFileSync(path.join(dossier, 'page.txt'), 'ok'); return { ok: true }; },
  });
  assert.strictEqual(bilan[0].ok, true);
  assert.ok(fs.existsSync(bilan[0].rapport), 'rapport du directeur');
  assert.match(fs.readFileSync(bilan[0].rapport, 'utf8'), /page\.txt/);
  assert.strictEqual((await src.lister())[0].statut, 'À faire', 'le ticket n\'est pas fermé : pas de fusion dans le lot 1');
});

test('boucle : une modification de fichier critique met le ticket en attente et passe au suivant', async () => {
  const { r, base, src, charger } = await fixture([{ titre: 'Changer la garde', rang: 1 }, { titre: 'Autre chose', rang: 2 }]);
  const bilan = await boucle({
    charger, src, racine: r, base, max: 2,
    runner: async ({ ticket, dossier }) => {
      if (ticket.titre === 'Changer la garde') { fs.mkdirSync(path.join(dossier, 'siege'), { recursive: true }); fs.writeFileSync(path.join(dossier, 'siege', 'garde.js'), '//'); }
      else fs.writeFileSync(path.join(dossier, 'ok.txt'), 'ok');
      return { ok: true };
    },
  });
  assert.strictEqual(bilan[0].attente, true, 'premier ticket en attente');
  assert.strictEqual(bilan[1].ok, true, 'le suivant est traité');
  const tickets = await src.lister();
  assert.strictEqual(tickets.find(t => t.titre === 'Changer la garde').statut, 'Bloqué');
  assert.strictEqual(tickets.find(t => t.titre === 'Autre chose').statut, 'À faire');
});

test('boucle : un titre à risque (fusion) est mis en attente avant même de créer une instance', async () => {
  const { r, base, src, charger } = await fixture([{ titre: 'Fusionner la PR de test', rang: 1 }]);
  let lance = false;
  const bilan = await boucle({ charger, src, racine: r, base, max: 1, runner: async () => { lance = true; return { ok: true }; } });
  assert.strictEqual(bilan[0].attente, true);
  assert.strictEqual(lance, false, 'aucune instance lancée');
  assert.ok(!fs.existsSync(path.join(base, 'eia-001')), 'aucun worktree créé');
});
