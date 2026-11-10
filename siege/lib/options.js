// Parseur d'options commun aux outils du Siège (backlog, github, exception, agent, demande, filiale).
// Une option répétée est refusée avant toute action : « le dernier gagne » permettrait de masquer une valeur
// d'identité (--auteur qa … --auteur CEO). Les noms sont comparés normalisés (--a-b et --a_b sont la même option).
'use strict';

class ErreurSiege extends Error {}                 // erreur attendue des outils : message clair, jamais de trace de pile
class ErreurOptions extends ErreurSiege {}

// args : mots de la ligne de commande après le nom de l'outil → { o, reste }
// o : options (--nom valeur ; valeur vide si suivie d'une autre option ou absente) ; reste : mots positionnels
function options(args) {
  const o = Object.create(null), reste = [], vues = new Set();
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (!a.startsWith('--')) { reste.push(a); continue; }
    if (a.includes('=')) throw new ErreurOptions('forme --option=valeur non supportée : ' + a.split('=')[0] + ' (écrire --option valeur)');
    const nom = a.slice(2), k = nom.replace(/-/g, '_');
    if (vues.has(k)) throw new ErreurOptions('option répétée : --' + nom);
    vues.add(k);
    o[k] = args[i + 1] !== undefined && !String(args[i + 1]).startsWith('--') ? args[++i] : '';
  }
  return { o, reste };
}

module.exports = { options, ErreurSiege, ErreurOptions };
