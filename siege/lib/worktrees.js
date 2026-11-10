// Mode autonome, lot 1 : chaque instance d'agent travaille dans son propre git worktree, sur sa propre branche.
// Deux instances ne partagent jamais un répertoire de travail. Aucune suppression de branche : le travail non poussé
// reste récupérable.
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const { ErreurSiege } = require('./options');

const BRANCHE = /^(feature|fix)\/[A-Za-z0-9][A-Za-z0-9._\/-]{0,80}$/;
const INSTANCE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;

function git(racine, args) {
  return execFileSync('git', ['-C', racine, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function verifier(id, branche) {
  if (!INSTANCE.test(id || '')) throw new ErreurSiege('identifiant d\'instance invalide : ' + String(id).slice(0, 40));
  if (!BRANCHE.test(branche || '')) throw new ErreurSiege('branche refusée (feature/… ou fix/… seulement) : ' + String(branche).slice(0, 80));
}

// Crée le worktree d'une instance : base/<id>, sur une nouvelle branche issue de `depart`
function creer({ racine, base, id, branche, depart = 'main' }) {
  verifier(id, branche);
  const dossier = path.join(path.resolve(base), id);
  git(racine, ['worktree', 'add', '-b', branche, dossier, depart]);
  return dossier;
}

// Retire le worktree d'une instance (sans toucher à la branche)
function supprimer({ racine, base, id }) {
  if (!INSTANCE.test(id || '')) throw new ErreurSiege('identifiant d\'instance invalide');
  const dossier = path.join(path.resolve(base), id);
  git(racine, ['worktree', 'remove', '--force', dossier]);
}

// Worktrees existants : [{ dossier, branche }]
function lister(racine) {
  const sortie = git(racine, ['worktree', 'list', '--porcelain']);
  const res = [];
  for (const bloc of sortie.split('\n\n')) {
    const d = /^worktree (.+)$/m.exec(bloc), b = /^branch refs\/heads\/(.+)$/m.exec(bloc);
    if (d) res.push({ dossier: d[1], branche: b ? b[1] : '' });
  }
  return res;
}

// Fichiers modifiés dans le worktree (commits depuis `depart` et modifications non suivies), lus par git lui-même
function fichiersModifies(dossier, depart = 'main') {
  const suivis = git(dossier, ['diff', '--name-only', depart]);
  const nonSuivis = git(dossier, ['ls-files', '--others', '--exclude-standard']);
  return [...new Set([...suivis.split('\n'), ...nonSuivis.split('\n')].filter(Boolean))];
}

module.exports = { creer, supprimer, lister, fichiersModifies, BRANCHE, INSTANCE };
