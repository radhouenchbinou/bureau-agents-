// Clonage d'un dépôt GitHub depuis le Siège : https seulement, hôte de l'entreprise seulement, pas d'identifiant dans
// l'adresse, dossier de destination dans projets/ uniquement, jamais d'écrasement. Un dépôt privé échoue (aucun
// identifiant n'est demandé ni transmis) : l'accès privé passe par l'App GitHub, pas par ce formulaire.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const { ErreurSiege } = require('./options');

const NOM = /^[a-z0-9][a-z0-9._-]{0,60}$/;
const CHEMIN = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?(\.git)?\/?$/;

function valider({ url, nom, hote = 'https://github.com' }) {
  if (!NOM.test(String(nom || ''))) throw new ErreurSiege('nom de dossier invalide (minuscules, chiffres, points, tirets, underscores)');
  let u;
  try { u = new URL(String(url || '')); } catch { throw new ErreurSiege('adresse de dépôt invalide'); }
  if (u.protocol !== 'https:') throw new ErreurSiege('adresse https attendue');
  if (u.username || u.password) throw new ErreurSiege('pas d\'identifiant dans l\'adresse');
  const h = new URL(hote).host;
  if (u.host !== h) throw new ErreurSiege(`seul l'hôte ${h} est autorisé`);
  if (!CHEMIN.test(u.pathname)) throw new ErreurSiege('adresse de dépôt attendue : /propriétaire/dépôt');
  return `https://${u.host}${u.pathname.replace(/\.git\/?$/, '').replace(/\/$/, '')}`;
}

// Clone dans <racine>/projets/<nom>. Renvoie { dossier, depot }.
function cloner({ racine, url, nom, hote = 'https://github.com', execFn = execFileSync }) {
  const depot = valider({ url, nom, hote });
  const dossier = path.join(racine, 'projets', nom);
  if (fs.existsSync(dossier)) throw new ErreurSiege('dossier déjà présent : projets/' + nom);
  fs.mkdirSync(path.dirname(dossier), { recursive: true });
  try { execFn('git', ['clone', '--', depot, dossier], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 }); }
  catch (e) { fs.rmSync(dossier, { recursive: true, force: true }); throw new ErreurSiege('clonage impossible (dépôt privé ou inaccessible) : ' + String(e.stderr || e.message).split('\n')[0].slice(0, 160)); }
  return { dossier, depot };
}

module.exports = { cloner, valider };
