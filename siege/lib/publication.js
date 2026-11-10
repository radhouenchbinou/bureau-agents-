// Mode autonome, lot 6 : publication d'une instance sur GitHub. Pousse la branche de l'instance, ouvre la PR vers main
// et lit les feux agents/revue et agents/securite sur le commit. La fusion n'est PAS ici : elle dépend d'une décision
// du CEO (la vérification d'approbation de github.js) et des feux posés par les agents revue et sécurité.
'use strict';
const gh = require('./github');

function publier({ jeton, repo, depart = 'main', pousserFn = gh.pousser, appelFn = gh.appel }) {
  return async ({ ticket, branche, dossier }) => {
    pousserFn(dossier, repo, branche, jeton);
    const pr = await appelFn('POST', `/repos/${repo}/pulls`, jeton, {
      title: `${ticket.id} · ${ticket.titre}`.slice(0, 200),
      head: branche,
      base: depart,
      body: `Ouverte par le mode autonome pour ${ticket.id}.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`,
    });
    const st = await appelFn('GET', `/repos/${repo}/commits/${pr.head.sha}/status`, jeton);
    const etat = ctx => ((st.statuses || []).find(s => s.context === ctx) || {}).state || '';
    return { pr: `#${pr.number}`, numero: pr.number, sha: pr.head.sha, feux: { revue: etat('agents/revue'), securite: etat('agents/securite') } };
  };
}

// Fusion d'une PR autonome : feux revue et sécurité verts, pas de conflit, sans approbation du CEO (décision du 2026-11-10)
function fusionner({ jeton, repo, fusionnableFn = gh.fusionnable, appelFn = gh.appel }) {
  return async ({ pr }) => {
    const numero = Number(String(pr).replace('#', ''));
    const f = await fusionnableFn(jeton, repo, numero, { approbation: false });
    if (f.manque.length) throw new Error('fusion refusée : ' + f.manque.join(', '));
    await appelFn('PUT', `/repos/${repo}/pulls/${numero}/merge`, jeton, { merge_method: 'squash', sha: f.p.head.sha });
  };
}

// Pose les deux feux sur le commit relu (lot 8)
function poserFeux({ jeton, repo, appelFn = gh.appel }) {
  return async ({ sha, revue, securite }) => {
    for (const [contexte, etat] of [['agents/revue', revue], ['agents/securite', securite]]) {
      await appelFn('POST', `/repos/${repo}/statuses/${sha}`, jeton, { state: etat, context: contexte, description: 'mode autonome' });
    }
  };
}

module.exports = { publier, fusionner, poserFeux };
