#!/usr/bin/env node
// Exceptions aux droits des agents, en ligne de commande.
//   Directeur : demander, activer, terminer, liste, voir.
//   CEO (vous, dans un terminal) : accorder, refuser — la garde interdit ces deux commandes à tous les agents.
'use strict';
const ex = require('./lib/exceptions');

const AIDE = `Exceptions — usage : node siege/exception.js <commande>

  liste [--statut demandee|accordee|active|terminee|refusee]
  voir <EXC-ID>
  demander --agent <rôle> --ticket <ID> --type bash|ecriture|lecture|web|outil --motif "<action exacte>" --justification "<pourquoi>"
  activer <EXC-ID>        (directeur, après accord du CEO)
  terminer <EXC-ID>       (directeur ; sinon fermée automatiquement à la fin de la tâche de l'agent)
  accorder <EXC-ID> [--commentaire "…"]   (CEO seulement)
  refuser <EXC-ID> [--commentaire "…"]    (CEO seulement)
`;
const opts = a => { const o = {}, r = []; for (let i = 0; i < a.length; i++) { if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] !== undefined && !a[i + 1].startsWith('--') ? a[++i] : ''; else r.push(a[i]); } return { o, r }; };
const ligne = e => `${e.id} [${e.statut}] ${e.agent}${e.ticket ? ' · ' + e.ticket : ''} · ${e.type} « ${e.motif} »\n    ${e.justification}`;

function main(argv) {
  const [cmd, ...a] = argv, { o, r } = opts(a);
  switch (cmd) {
    case undefined: case 'aide': console.log(AIDE); return;
    case 'liste': { const l = ex.lire().liste.filter(e => !o.statut || e.statut === o.statut); if (!l.length) console.log('Aucune exception.'); l.forEach(e => console.log(ligne(e))); return; }
    case 'voir': { const e = ex.lire().liste.find(x => x.id === r[0]); if (!e) throw new ex.ErreurException('Introuvable'); console.log(JSON.stringify(e, null, 2)); return; }
    case 'demander': { const e = ex.demander({ agent: o.agent, ticket: o.ticket, type: o.type, motif: o.motif, justification: o.justification }); console.log('Demande enregistrée : ' + ligne(e) + '\nÀ faire valider par le CEO (Siège › Exceptions, ou node siege/exception.js accorder ' + e.id + ').'); return; }
    case 'activer': { const e = ex.activer(r[0]); console.log('Active : ' + ligne(e) + '\nElle se fermera quand ' + e.agent + ' aura terminé sa tâche.'); return; }
    case 'terminer': { const e = ex.terminer(r[0]); console.log('Terminée : ' + e.id); return; }
    case 'accorder': case 'refuser': { const e = ex.decider(r[0], cmd === 'accorder', o.commentaire); console.log((cmd === 'accorder' ? 'Accordée : ' : 'Refusée : ') + e.id); return; }
    default: throw new ex.ErreurException('Commande inconnue : ' + cmd + '\n\n' + AIDE);
  }
}
if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error(e instanceof ex.ErreurException ? 'Erreur : ' + e.message : e); process.exit(1); } }
module.exports = { main };
