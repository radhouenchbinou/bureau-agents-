// Mode autonome, lot 1 : boucle du directeur. Prend le ticket suivant de la file, évalue sa criticité, ouvre une
// instance dans son propre worktree, lance le runner injecté, réévalue la criticité sur les fichiers réellement
// modifiés, puis passe au suivant. Au-delà du seuil (90 %), le ticket est mis en attente. Le rapport du directeur est
// écrit pour chaque instance qui aboutit. Aucune fusion dans ce lot.
'use strict';
const fs = require('fs'), path = require('path');
const { file } = require('./backlog');
const crit = require('./criticite');
const wt = require('./worktrees');
const fusionAuto = require('./fusion-auto');

const EXCLUS = ['Bloqué', 'En revue', 'Livré', 'En cours'];

// Premier ticket de la file qui n'est ni bloqué, ni en revue, ni livré, ni déjà en cours
function choisir(features, bugs) {
  return file(features, bugs).ordre.find(e => !EXCLUS.includes(e.statut)) || null;
}

async function mettreEnAttente(src, ticket, motif) {
  await src.modifier(ticket.id, { statut: 'Bloqué' });
  await src.commenter(ticket.id, { auteur: 'directeur', texte: `Mode autonome : ticket mis en attente. ${motif}` });
}

// Rapport du directeur : docs/rapports/<ID>-directeur.md, un par instance aboutie
function rediger({ ticket, branche, dossier, fichiers, criticite, ok, fusion = 'non faite (PR seulement)' }) {
  const dir = path.join(dossier, 'docs', 'rapports');   // dans le worktree de l'instance, versionné avec son travail
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${ticket.id}-directeur.md`);
  const corps = [
    `# ${ticket.id} — rapport du directeur`,
    '',
    `- Titre : ${ticket.titre}`,
    `- Branche : ${branche}`,
    `- Instance (worktree) : ${dossier}`,
    `- Fichiers modifiés :`,
    ...fichiers.map(x => `  - ${x}`),
    `- Criticité : ${criticite.taux} % (${criticite.motif})`,
    `- Résultat de l'instance : ${ok ? 'réussi' : 'échec'}`,
    `- Fusion : ${fusion}`,
    '',
  ].join('\n');
  fs.writeFileSync(f, corps);
  return f;
}

// boucle({ charger, src, racine, base, runner, max, journal })
//   charger()  -> { features, bugs } (relu à chaque tour)
//   src        -> source des features (lister, modifier, commenter)
//   runner({ ticket, dossier, branche }) -> { ok, action?, avisModele? }   (le lanceur d'agent, injecté)
// publier({ ticket, branche, dossier, fichiers }) -> { pr, feux: { revue, securite } }   (optionnel : sans lui, pas de PR ni de fusion)
// fusionner({ ticket, pr })                       -> fusionne la PR                       (optionnel, lot 4)
async function boucle({ charger, src, racine, base, runner, max = 1, journal = () => {}, publier = null, fusionner = null }) {
  const bilan = [];
  for (let i = 0; i < max; i++) {
    const { features, bugs } = await charger();
    const t = choisir(features, bugs);
    if (!t) { bilan.push({ fin: 'rien à faire' }); break; }

    const avant = crit.evaluer({ action: t.titre });
    if (crit.enAttente(avant.taux)) {
      await mettreEnAttente(src, t, `Criticité ${avant.taux} % : ${avant.motif}.`);
      bilan.push({ ticket: t.id, attente: true, taux: avant.taux }); continue;
    }

    const id = `${t.id.toLowerCase()}-${Date.now().toString(36)}`, branche = 'feature/' + t.id.toLowerCase();
    let dossier;
    try { dossier = wt.creer({ racine, base, id, branche }); }
    catch (e) { await mettreEnAttente(src, t, 'Worktree impossible : ' + String(e.message).slice(0, 160)); bilan.push({ ticket: t.id, attente: true, erreur: 'worktree' }); continue; }

    let res;
    try { res = await runner({ ticket: t, dossier, branche }); }
    catch (e) { await mettreEnAttente(src, t, 'Instance en erreur : ' + String(e.message).slice(0, 160)); bilan.push({ ticket: t.id, attente: true, erreur: 'instance' }); continue; }

    // Criticité réévaluée sur les fichiers réellement modifiés, pas sur ce que le runner annonce
    const fichiers = wt.fichiersModifies(dossier);
    const apres = crit.evaluer({ fichiers, action: res.action || '', avisModele: res.avisModele || null });
    if (crit.enAttente(apres.taux)) {
      await mettreEnAttente(src, t, `Criticité ${apres.taux} % après exécution : ${apres.motif}.`);
      bilan.push({ ticket: t.id, attente: true, taux: apres.taux }); continue;
    }

    let fusion = 'non faite (PR seulement)';
    if (publier) {
      let pub;
      try { pub = await publier({ ticket: t, branche, dossier, fichiers }); }
      catch (e) { await mettreEnAttente(src, t, 'Publication impossible : ' + String(e.message).slice(0, 160)); bilan.push({ ticket: t.id, attente: true, erreur: 'publication' }); continue; }
      const dec = await fusionAuto.fusionnerSiPret({ criticite: apres, feux: pub.feux, fusionner: () => fusionner({ ticket: t, pr: pub.pr }) });
      if (!dec.fusionne) {
        await mettreEnAttente(src, t, `PR ${pub.pr} ouverte, non fusionnée : ${dec.motif}.`);
        bilan.push({ ticket: t.id, attente: true, pr: pub.pr, motif: dec.motif }); continue;
      }
      fusion = `fusionnée (${dec.motif}) — PR ${pub.pr}`;
      await src.modifier(t.id, { statut: 'En revue' });
      await src.commenter(t.id, { auteur: 'directeur', texte: `Mode autonome : PR ${pub.pr} fusionnée (${dec.motif}).` });
    }
    const rapport = rediger({ ticket: t, branche, dossier, fichiers, criticite: apres, ok: !!res.ok, fusion });
    bilan.push({ ticket: t.id, branche, ok: !!res.ok, rapport });
    journal({ ticket: t.id, branche, ok: !!res.ok, rapport });
  }
  return bilan;
}

module.exports = { boucle, choisir, rediger };
