// Canaux de messagerie (Telegram, Slack) vus de la même façon par la messagerie et par node siege/demande.js.
// Dans une demande, l'auteur est désigné par sa clé : identifiant Telegram (nombre) ou « slack:U… ».
'use strict';
const tg = require('./telegram'), sl = require('./slack');

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
const TOUS = [telegram, slack];

// Le canal et l'identifiant d'une personne à partir de sa clé de demande
function deCle(cle) { for (const c of TOUS) { const id = c.idDe(cle); if (id != null) return { canal: c, id }; } return null; }

module.exports = { telegram, slack, TOUS, deCle };
