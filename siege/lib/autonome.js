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
const par = require('./parallele');

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
// Livraison d'une instance : publier la PR, lire les feux, fusionner si la décision est positive
// revoir({ ticket, dossier }) -> { revue, securite } : relecture par des instances (lot 8) ; poser({ sha, revue, securite }) : les feux
function livraison(publier, fusionner, { revoir = null, poser = null } = {}) {
  return async ({ ticket, branche, dossier, fichiers, criticite }) => {
    const pub = await publier({ ticket, branche, dossier, fichiers });
    let feux = pub.feux;
    if (revoir && (!feux.revue || !feux.securite)) {
      feux = await revoir({ ticket, dossier });
      if (poser) await poser({ sha: pub.sha, revue: feux.revue, securite: feux.securite });
    }
    const dec = await fusionAuto.fusionnerSiPret({ criticite, feux, fusionner: () => fusionner({ ticket, pr: pub.pr }) });
    return { pr: pub.pr, fusionne: dec.fusionne, motif: dec.motif };
  };
}

async function boucle({ charger, src, racine, base, runner, max = 1, journal = () => {}, publier = null, fusionner = null, livrer = null, ticket = null, revoir = null, poser = null }) {
  const livrerFn = livrer || (publier ? livraison(publier, fusionner, { revoir, poser }) : null);
  const bilan = [];
  for (let i = 0; i < max; i++) {
    let t = ticket;
    if (!t) { const { features, bugs } = await charger(); t = choisir(features, bugs); }
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

    await src.modifier(t.id, { statut: 'En cours' });   // un ticket lancé n'est plus repris par la file
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
    if (livrerFn) {
      let l;
      try { l = await livrerFn({ ticket: t, branche, dossier, fichiers, criticite: apres }); }
      catch (e) { await mettreEnAttente(src, t, 'Livraison impossible : ' + String(e.message).slice(0, 160)); bilan.push({ ticket: t.id, attente: true, erreur: 'livraison' }); continue; }
      if (!l.fusionne) {
        await mettreEnAttente(src, t, `PR ${l.pr} ouverte, non fusionnée : ${l.motif}.`);
        bilan.push({ ticket: t.id, attente: true, pr: l.pr, motif: l.motif }); continue;
      }
      fusion = `fusionnée (${l.motif}) — PR ${l.pr}`;
      await src.modifier(t.id, { statut: 'En revue' });
      await src.commenter(t.id, { auteur: 'directeur', texte: `Mode autonome : PR ${l.pr} fusionnée (${l.motif}).` });
    }
    if (!livrerFn) await src.modifier(t.id, { statut: 'En revue' });   // sans livraison : instance terminée, PR à relire
    const rapport = rediger({ ticket: t, branche, dossier, fichiers, criticite: apres, ok: !!res.ok, fusion });
    bilan.push({ ticket: t.id, branche, ok: !!res.ok, rapport });
    journal({ ticket: t.id, branche, ok: !!res.ok, rapport });
  }
  return bilan;
}

// Parallélisme (lot 5) : des instances tournent en même temps, dans leurs worktrees ; le nombre suit la capacité de la
// machine (recalculée avant chaque lancement). Les livraisons (PR et fusion) passent une à une, par un verrou.
// Un ticket en vol n'est jamais repris par une autre instance.
async function boucleParallele({ charger, src, racine, base, runner, publier = null, fusionner = null, max = 1, capacite = () => par.capacite(), intervalleMs = 30000, journal = () => {}, revoir = null, poser = null }) {
  const bilan = [], enVol = new Map(), serie = par.verrou();
  const livrer = publier ? (a => serie(() => livraison(publier, fusionner, { revoir, poser })(a))) : null;
  let lances = 0, plusDeTicket = false;
  for (;;) {
    while (enVol.size < capacite() && lances < max && !plusDeTicket) {
      const { features, bugs } = await charger();
      const t = choisir(features.filter(f => !enVol.has(f.id)), bugs);
      if (!t) { plusDeTicket = true; break; }
      lances++;
      const p = boucle({ charger, src, racine, base, runner, max: 1, journal, livrer, ticket: t })
        .then(b => { bilan.push(...b); })
        .catch(e => { bilan.push({ ticket: t.id, erreur: String(e.message).slice(0, 160) }); })
        .finally(() => enVol.delete(t.id));
      enVol.set(t.id, p);
    }
    if (enVol.size === 0) {
      if (plusDeTicket || lances >= max) break;
      await new Promise(r => setTimeout(r, intervalleMs));   // capacité nulle : on attend
      continue;
    }
    await Promise.race([...enVol.values(), new Promise(r => setTimeout(r, intervalleMs))]);
  }
  return bilan;
}

module.exports = { boucle, boucleParallele, choisir, rediger, livraison };
