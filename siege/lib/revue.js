// Mode autonome, lot 8 : feux agents/revue et agents/securite produits par des instances de relecture. Un agent
// reviewer ou rssi-devsecops lit le diff de la PR et rend une ligne de verdict. Le verdict devient le feu posé sur
// le commit. Un agent qui échoue, expire ou rend un verdict illisible donne un feu rouge (échec fermé).
'use strict';

const ROLES = { revue: 'reviewer', securite: 'rssi-devsecops' };

function mission(role, ticket) {
  const angle = role === 'rssi-devsecops'
    ? 'sécurité : secrets, entrées, droits, dépendances'
    : 'exactitude, lisibilité, tests, cohérence avec le dépôt';
  return [
    `Ticket : ${ticket.id}`,
    `Étape : ${role === 'rssi-devsecops' ? '7 · Sécurité' : '6 · Revue de code'}`,
    `Relis le diff de cette branche (${angle}). Ne modifie rien, ne pousse rien.`,
    'Termine par une seule ligne exacte : VERDICT: OK ou VERDICT: KO, suivie de 3 lignes au plus de motif.',
  ].join('\n');
}

// Lit le verdict de la sortie d'un agent : OK → success, tout le reste (dont absence de verdict) → failure
function verdict(sortie) {
  const m = [...String(sortie || '').matchAll(/^VERDICT:\s*(OK|KO)\s*$/gm)].pop();
  return m && m[1] === 'OK' ? 'success' : 'failure';
}

// revoir({ lancer, dossier, ticket }) -> { revue, securite }   (lancer = runner d'agent injecté : { ok, sortie })
async function revoir({ lancer, dossier, ticket }) {
  const res = {};
  for (const [cle, role] of Object.entries(ROLES)) {
    let r;
    try { r = await lancer({ dossier, ticket, role, mission: mission(role, ticket) }); }
    catch { r = { ok: false, sortie: '' }; }
    res[cle] = r && r.ok ? verdict(r.sortie) : 'failure';
  }
  return res;
}

module.exports = { revoir, verdict, mission, ROLES };
