// Profils de stack (N18) : image, commandes autorisées et chemins sensibles, lus depuis config/profils-stack.json.
// Un profil ou un type d'agent mal formé est refusé avec un message clair ; une commande n'est autorisée que si
// elle figure mot pour mot dans la liste de son profil (aucune commande libre).
'use strict';
const fs = require('fs'), path = require('path');
const { ErreurSiege } = require('./options');

const CHAMPS_COMMANDES = ['build', 'test', 'lint', 'scan'];
const IMAGE = /^[a-z0-9][a-z0-9._\/:-]{1,200}$/;
const ID = /^[a-z][a-z0-9-]{1,40}$/;

function valider(cfg) {
  if (!cfg || typeof cfg !== 'object' || typeof cfg.profils !== 'object') throw new ErreurSiege('profils-stack.json : clé « profils » attendue');
  for (const [id, p] of Object.entries(cfg.profils)) {
    if (!ID.test(id)) throw new ErreurSiege(`Profil « ${id} » : identifiant en minuscules (lettres, chiffres, tirets)`);
    if (!p.libelle) throw new ErreurSiege(`Profil ${id} : libelle manquant`);
    if (!IMAGE.test(p.image || '')) throw new ErreurSiege(`Profil ${id} : image de conteneur invalide`);
    for (const c of CHAMPS_COMMANDES) {
      if (!Array.isArray(p[c]) || p[c].some(x => typeof x !== 'string' || !x.trim())) throw new ErreurSiege(`Profil ${id} : « ${c} » doit être une liste de commandes`);
    }
    if (!Array.isArray(p.chemins_sensibles)) throw new ErreurSiege(`Profil ${id} : chemins_sensibles doit être une liste`);
  }
  for (const [id, t] of Object.entries(cfg.types_agents || {})) {
    if (!ID.test(id)) throw new ErreurSiege(`Type d'agent « ${id} » : identifiant invalide`);
    if (!cfg.profils[t.profil]) throw new ErreurSiege(`Type d'agent ${id} : profil « ${t.profil} » inconnu`);
  }
  return cfg;
}

function charger(racine) {
  const f = path.join(racine, 'config', 'profils-stack.json');
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { throw new ErreurSiege(`Profils de stack illisibles (${f}) : ${e.message}`); }
  return valider(cfg);
}

// Une commande est autorisée seulement si elle est exactement une des commandes déclarées du profil pour ce champ.
function commandeAutorisee(profil, champ, commande) {
  return CHAMPS_COMMANDES.includes(champ) && (profil[champ] || []).includes(String(commande).trim());
}

module.exports = { charger, valider, commandeAutorisee, CHAMPS_COMMANDES };
