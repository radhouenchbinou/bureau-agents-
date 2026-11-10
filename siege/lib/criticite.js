// Mode autonome, lot 1 : taux de criticité d'une décision. Règle fixe d'abord : un fichier critique ou une action de
// fusion, de déploiement ou de secret donne 100 %, et un agent-modèle ne peut pas abaisser ce taux. Hors de ces cas,
// le taux de base est bas, et un avis de modèle (marqué « exception ») peut le relever. Au-delà de 90 %, la décision
// met le ticket en attente.
'use strict';

const SEUIL = 90;
const BASE = 20;
const FICHIERS_CRITIQUES = [
  /(^|\/)siege\/garde\.js$/, /(^|\/)lib\/garde\.js$/, /(^|\/)github\.js$/, /(^|\/)lib\/github\.js$/,
  /(^|\/)lib\/identite\.js$/, /(^|\/)lib\/exceptions?\.js$/, /(^|\/)exception\.js$/,
  /(^|\/)droits\//, /(^|\/)portfolio\//, /(^|\/)process\//, /(^|\/)CLAUDE\.md$/,
  /\.env$/, /\.pem$/, /secret/i, /(^|\/)\.claude\//,
];
const ACTIONS_CRITIQUES = /fusion|merge|deploi|déploi|production|secret|jeton|token/i;

function evaluer({ fichiers = [], action = '', avisModele = null } = {}) {
  const critiques = fichiers.filter(f => FICHIERS_CRITIQUES.some(r => r.test(f)));
  if (critiques.length) return { taux: 100, fixe: true, motif: 'fichiers critiques : ' + critiques.join(', ') };
  if (ACTIONS_CRITIQUES.test(action)) return { taux: 100, fixe: true, motif: 'action critique : ' + action.slice(0, 80) };
  let taux = BASE, motif = 'règle de base';
  if (avisModele && avisModele.exception && Number.isFinite(avisModele.taux)) {
    taux = Math.max(0, Math.min(100, Math.round(avisModele.taux)));
    motif = 'exception du modèle : ' + String(avisModele.motif || '').slice(0, 120);
  }
  return { taux, fixe: false, motif };
}

function enAttente(taux) { return taux > SEUIL; }

module.exports = { evaluer, enAttente, SEUIL, BASE };
