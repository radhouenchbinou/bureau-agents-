// Canaux de messagerie (Telegram, Slack) vus de la même façon par la messagerie et par node siege/demande.js.
// Dans une demande, l'auteur est désigné par sa clé : identifiant Telegram (nombre) ou « slack:U… ».
'use strict';
const tg = require('./telegram'), sl = require('./slack'), tm = require('./teams');

const telegram = {
  nom: 'telegram', libelle: 'Telegram', lire: tg.lire, modifier: tg.modifier,
  pret: () => tg.lire().actif && !!tg.jeton(),
  cle: id => Number(id), idDe: cle => (typeof cle === 'number' || /^\d+$/.test(String(cle))) ? Number(cle) : null,
  envoyer: async (id, texte, boutons) => String((await tg.envoyer(id, texte, boutons)).message_id)
};
const slack = {
  nom: 'slack', libelle: 'Slack', lire: sl.lire, modifier: sl.modifier,
  pret: () => sl.lire().actif && !!sl.jetonBot() && sl.disponible(),
  cle: id => 'slack:' + id, idDe: cle => /^slack:[UW][A-Z0-9]{6,20}$/.test(String(cle)) ? String(cle).slice(6) : null,
  envoyer: async (id, texte, boutons) => (await sl.envoyer(id, texte, boutons)).ts
};
// Teams (Graph, sans boutons) : les choix deviennent une consigne de réponse en texte, lue par la messagerie
const choixEnTexte = boutons => {
  if (!boutons) return '';
  const d = String(boutons[0][1] || ''), m = /^([vc]):(DEM-\d{3,5}):/.exec(d);
  if (!m) return '';
  return m[1] === 'v' ? '\n\nRépondez « oui » si c\'est bien cela, ou « non » pour préciser.'
    : `\n\nRépondez « accepter ${m[2]} » ou « refuser ${m[2]} », ou « ${m[2]} : <votre consigne> ».`;
};
const teams = {
  nom: 'teams', libelle: 'Teams', lire: tm.lire, modifier: tm.modifier,
  pret: () => { const e = tm.lire(); return e.actif && !!e.moi && tm.connecte(); },
  cle: id => 'teams:' + id, idDe: cle => /^teams:[0-9a-f-]{36}$/i.test(String(cle)) ? String(cle).slice(6) : null,
  envoyer: async (id, texte, boutons) => tm.envoyer(id, texte + choixEnTexte(boutons))
};
const TOUS = [telegram, slack, teams];

// Le canal et l'identifiant d'une personne à partir de sa clé de demande
function deCle(cle) { for (const c of TOUS) { const id = c.idDe(cle); if (id != null) return { canal: c, id }; } return null; }

module.exports = { telegram, slack, teams, TOUS, deCle, choixEnTexte };
