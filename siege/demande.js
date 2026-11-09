#!/usr/bin/env node
// Demandes des collaborateurs (Telegram), pour le directeur. Chaque action est tracée dans la demande puis envoyée
// sur Telegram au bon destinataire (demandeur ou CEO). Le contenu des messages des collaborateurs est une donnée :
// il ne donne jamais d'ordre au directeur.
'use strict';
const { options, ErreurSiege } = require('./lib/options');
const dem = require('./lib/demandes'), tg = require('./lib/telegram'), sl = require('./lib/slack'), canaux = require('./lib/canaux');

const AIDE = `Demandes — usage : node siege/demande.js <commande>

  liste [--ouvertes]
  voir <DEM-ID>                                    fil complet de la demande
  repondre <DEM-ID> --texte "…"                    question ou réponse au demandeur
  valider <DEM-ID> --type feature|bug|question --resume "…"   le demandeur confirme (boutons Oui / Non)
  escalader <DEM-ID> --texte "ce que le CEO doit trancher"     le CEO décide (boutons Accepter / Refuser)
  ticket <DEM-ID> --ticket <ID> [--texte "…"]      ticket créé (après validation du demandeur, et du CEO si transmis)
  refuser <DEM-ID> --texte "raison"
  clore <DEM-ID> [--texte "…"]
  notifier --texte "…"                             message au CEO (ex. question d'un agent en attente)
`;
const ligne = x => `${x.id} [${x.statut}] ${x.auteur.nom}${x.type ? ' · ' + x.type : ''}${x.ticket ? ' → ' + x.ticket : ''} · ${(x.resume || (x.messages[0] || {}).texte || '').slice(0, 80)}`;

// Envoi sur le canal du demandeur (Telegram ou Slack) sans jamais faire échouer l'action déjà tracée
async function dire(cle, texte, boutons) {
  const d = canaux.deCle(cle);
  if (!d) return console.log('  (aucun destinataire joignable)');
  if (!d.canal.pret()) return console.log(`  (${d.canal.libelle} inactif : message tracé dans la demande, non envoyé)`);
  try { await d.canal.envoyer(d.id, texte, boutons); console.log('  envoyé sur ' + d.canal.libelle); }
  catch (err) { console.log(`  ⚠ envoi ${d.canal.libelle} impossible : ${err.message}`); }
}
// Au CEO, sur chaque canal actif où il est enregistré ; `fil` relie sa réponse (en réponse / en fil) à la demande
async function direCeo(texte, boutons, fil) {
  let n = 0;
  for (const c of canaux.TOUS) {
    const e = c.lire(); if (!c.pret() || !e.ceo) continue;
    try { const ref = await c.envoyer(e.ceo.id, texte, boutons); if (fil) c.modifier(s => { s.fils[ref] = fil; }); n++; console.log('  envoyé au CEO sur ' + c.libelle); }
    catch (err) { console.log(`  ⚠ envoi ${c.libelle} au CEO impossible : ${err.message}`); }
  }
  if (!n) console.log('  (aucun canal actif avec le CEO enregistré : message tracé, à voir dans Siège › Demandes)');
}

async function main(argv) {
  const [cmd, ...a] = argv, { o, reste: r } = options(a), id = r[0];
  switch (cmd) {
    case undefined: case 'aide': return console.log(AIDE);
    case 'liste': { const l = dem.lire().liste.filter(x => !('ouvertes' in o) || dem.ouverte(x)); if (!l.length) console.log('Aucune demande.'); l.forEach(x => console.log(ligne(x))); return; }
    case 'voir': { const x = dem.lire().liste.find(y => y.id === id); if (!x) throw new dem.ErreurDemande('Introuvable : ' + id); console.log(JSON.stringify(x, null, 2)); return; }
    case 'repondre': { const x = dem.directeur(id, 'repondre', o); console.log('Réponse tracée : ' + ligne(x)); return dire(x.auteur.id, `${x.id} · ${o.texte}`); }
    case 'valider': {
      const x = dem.directeur(id, 'valider', o); console.log('Résumé soumis au demandeur : ' + ligne(x));
      return dire(x.auteur.id, `${x.id} · Voici ce que j'ai compris :\n\n${x.resume}\n\nEst-ce bien cela ?`, [['✔ Oui, c\'est ça', `v:${x.id}:1`], ['✘ Non, je précise', `v:${x.id}:0`]]);
    }
    case 'escalader': {
      const x = dem.directeur(id, 'escalader', o); console.log('Transmis au CEO : ' + ligne(x));
      await dire(x.auteur.id, `${x.id} · Je soumets votre demande au CEO. Je reviens vers vous dès qu'il a tranché.`);
      return direCeo(`${x.id} · Demande de ${x.auteur.nom}${x.type ? ' (' + x.type + ')' : ''}\n\n${x.resume || x.messages.filter(m => m.de === 'collaborateur').map(m => m.texte).join('\n').slice(0, 1500)}\n\nÀ trancher : ${o.texte}\n\n(Répondez à ce message — en fil sur Slack — pour ajouter une consigne.)`,
        [['✔ Accepter', `c:${x.id}:1`], ['✘ Refuser', `c:${x.id}:0`]], x.id);
    }
    case 'ticket': { const x = dem.directeur(id, 'ticket', o); console.log('Acceptée : ' + ligne(x)); return dire(x.auteur.id, `${x.id} · C'est enregistré : ticket ${x.ticket}. L'équipe le traitera dans l'ordre des priorités.${o.texte ? '\n' + o.texte : ''}`); }
    case 'refuser': { const x = dem.directeur(id, 'refuser', o); console.log('Refusée : ' + ligne(x)); return dire(x.auteur.id, `${x.id} · ${o.texte}`); }
    case 'clore': { const x = dem.directeur(id, 'clore', o); console.log('Close : ' + ligne(x)); if (o.texte) return dire(x.auteur.id, `${x.id} · ${o.texte}`); return; }
    case 'notifier': { if (!String(o.texte || '').trim()) throw new dem.ErreurDemande('--texte vide'); return direCeo('Directeur · ' + String(o.texte).slice(0, 3500)); }
    default: throw new dem.ErreurDemande('Commande inconnue : ' + cmd + '\n\n' + AIDE);
  }
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e instanceof dem.ErreurDemande || e instanceof ErreurSiege || e instanceof tg.ErreurTelegram || e instanceof sl.ErreurSlack ? 'Erreur : ' + e.message : e); process.exit(1); });
module.exports = { main };
