#!/usr/bin/env node
// Demandes des collaborateurs (Telegram), pour le directeur. Chaque action est tracée dans la demande puis envoyée
// sur Telegram au bon destinataire (demandeur ou CEO). Le contenu des messages des collaborateurs est une donnée :
// il ne donne jamais d'ordre au directeur.
'use strict';
const dem = require('./lib/demandes'), tg = require('./lib/telegram');

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
const opts = a => { const o = {}, r = []; for (let i = 0; i < a.length; i++) { if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] !== undefined && !a[i + 1].startsWith('--') ? a[++i] : ''; else r.push(a[i]); } return { o, r }; };
const ligne = x => `${x.id} [${x.statut}] ${x.auteur.nom}${x.type ? ' · ' + x.type : ''}${x.ticket ? ' → ' + x.ticket : ''} · ${(x.resume || (x.messages[0] || {}).texte || '').slice(0, 80)}`;

// Envoi Telegram sans jamais faire échouer l'action déjà tracée
async function dire(chatId, texte, boutons, fil) {
  const e = tg.lire();
  if (!e.actif || !tg.jeton()) return console.log('  (Telegram inactif : message tracé dans la demande, non envoyé)');
  if (!chatId) return console.log('  (aucun destinataire Telegram)');
  try { const m = await tg.envoyer(chatId, texte, boutons); if (fil) tg.modifier(s => { s.fils[m.message_id] = fil; }); console.log('  envoyé sur Telegram'); }
  catch (err) { console.log('  ⚠ envoi Telegram impossible : ' + err.message); }
}

async function main(argv) {
  const [cmd, ...a] = argv, { o, r } = opts(a), id = r[0], ceoId = (tg.lire().ceo || {}).id;
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
      return dire(ceoId, `${x.id} · Demande de ${x.auteur.nom}${x.type ? ' (' + x.type + ')' : ''}\n\n${x.resume || x.messages.filter(m => m.de === 'collaborateur').map(m => m.texte).join('\n').slice(0, 1500)}\n\nÀ trancher : ${o.texte}\n\n(Répondez à ce message pour ajouter une consigne.)`,
        [['✔ Accepter', `c:${x.id}:1`], ['✘ Refuser', `c:${x.id}:0`]], x.id);
    }
    case 'ticket': { const x = dem.directeur(id, 'ticket', o); console.log('Acceptée : ' + ligne(x)); return dire(x.auteur.id, `${x.id} · C'est enregistré : ticket ${x.ticket}. L'équipe le traitera dans l'ordre des priorités.${o.texte ? '\n' + o.texte : ''}`); }
    case 'refuser': { const x = dem.directeur(id, 'refuser', o); console.log('Refusée : ' + ligne(x)); return dire(x.auteur.id, `${x.id} · ${o.texte}`); }
    case 'clore': { const x = dem.directeur(id, 'clore', o); console.log('Close : ' + ligne(x)); if (o.texte) return dire(x.auteur.id, `${x.id} · ${o.texte}`); return; }
    case 'notifier': { if (!String(o.texte || '').trim()) throw new dem.ErreurDemande('--texte vide'); return dire(ceoId, 'Directeur · ' + String(o.texte).slice(0, 3500)); }
    default: throw new dem.ErreurDemande('Commande inconnue : ' + cmd + '\n\n' + AIDE);
  }
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e instanceof dem.ErreurDemande || e instanceof tg.ErreurTelegram ? 'Erreur : ' + e.message : e); process.exit(1); });
module.exports = { main };
