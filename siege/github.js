#!/usr/bin/env node
// GitHub pour les agents, au nom de l'App de l'entreprise, avec un jeton limité au rôle et au repo de la filiale.
// La garde vérifie que --role est bien l'agent qui appelle ; ce script vérifie le reste (branche, droits, validations).
'use strict';
const path = require('path');
const gh = require('./lib/github');
const { filiales } = require('./lib/registre');
const garde = require('./lib/garde');
const cfgBacklog = require('./lib/config');
const { lot, livrer, lirePr } = require('./lib/livraison');

const RACINE = path.resolve(__dirname, '..');
const AIDE = `GitHub des agents — usage : node siege/github.js <commande> --role <agent> --filiale <Nom> …

  etat                                                     configuration et repos déclarés
  pousser --role R --filiale F --branche feature/ID        pousse la branche (jamais main)
  pr --role R --filiale F --ticket ID --branche feature/ID --titre "…" [--corps "…"]   ouvre la PR vers main et l'inscrit sur le ticket
  statut --role R --filiale F --pr N --contexte revue|securite --etat success|failure [--description "…"]
  fusionner --role devops --filiale F --pr N               fusionne si le CEO a approuvé et revue + sécurité au vert
  fusionner --role devops --ticket PARENT                  livraison groupée : toutes les PR du lot, ou aucune
`;
const opts = a => { const o = {}; for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] !== undefined && !a[i + 1].startsWith('--') ? a[++i] : ''; return o; };
const CONTEXTE_DU_ROLE = { reviewer: 'revue', 'rssi-devsecops': 'securite' };

async function main(argv) {
  const [cmd, ...a] = argv, o = opts(a);
  if (!cmd || cmd === 'aide') return console.log(AIDE);
  const politique = garde.charger(RACINE), c = gh.config(RACINE), fil = await filiales(path.join(RACINE, 'portfolio', 'filiales.md'));
  if (cmd === 'etat') {
    console.log(`App ${c.app_id}, installation ${c.installation_id}`);
    for (const f of fil) console.log(`  ${f.nom.padEnd(12)} ${f.repo.padEnd(22)} → ${(c.repos || {})[f.repo] || '(aucun repo GitHub)'}`);
    return;
  }
  const role = o.role; if (!role) throw new gh.ErreurGithub('--role obligatoire');
  if (cmd === 'fusionner' && o.ticket !== undefined) return livraisonGroupee(o, role, c, politique, fil);
  const { filiale, repo } = gh.repoDeFiliale(c, fil, o.filiale);
  const jeton = await gh.jetonRole(c, politique, role, repo);
  switch (cmd) {
    case 'pousser': {
      gh.pousser(path.join(RACINE, filiale.repo), repo, o.branche || '', jeton);
      return console.log(`Branche ${o.branche} poussée sur ${repo}`);
    }
    case 'pr': {
      if (!gh.BRANCHE.test(o.branche || '')) throw new gh.ErreurGithub('Branche feature/… ou fix/… attendue');
      // La PR appartient à un ticket de cette filiale : c'est ce qui permet la livraison groupée et le suivi
      const n = /^BUG-\d{3}$/.test(o.ticket || '') ? 'bugs' : 'features', src = cfgBacklog.source(n);
      const t = (await src.lister()).find(x => x.id === o.ticket);
      if (!t) throw new gh.ErreurGithub('--ticket <ID> obligatoire (ticket existant de la filiale)');
      if (t.filiale.toLowerCase() !== filiale.nom.toLowerCase()) throw new gh.ErreurGithub(`${t.id} appartient à ${t.filiale}, pas à ${filiale.nom}`);
      if (n === 'features' && t.pr) throw new gh.ErreurGithub(`${t.id} a déjà une PR : ${t.pr}`);
      const r = await gh.appel('POST', `/repos/${repo}/pulls`, jeton, { title: ((String(o.titre || '').startsWith(t.id) ? '' : t.id + ' · ') + String(o.titre || o.branche)).slice(0, 200), head: o.branche, base: 'main',
        body: String(o.corps || '').slice(0, 20000) + `\n\nTicket : ${t.id}` + (t.parent ? ` (livraison groupée avec ${t.parent})` : '') + `\n— Ouverte par l'agent ${role} (entreprise d'agents).` });
      if (n === 'features') await src.modifier(t.id, { pr: `${repo}#${r.number}` });
      await src.commenter(t.id, { auteur: role, texte: `PR ouverte : ${r.html_url}` });
      return console.log(`PR #${r.number} ouverte : ${r.html_url} (inscrite sur ${t.id})`);
    }
    case 'statut': {
      if (CONTEXTE_DU_ROLE[role] !== o.contexte) throw new gh.ErreurGithub(`Le rôle ${role} ne pose pas le feu « ${o.contexte} »`);
      if (!['success', 'failure'].includes(o.etat)) throw new gh.ErreurGithub('--etat success ou failure');
      const p = await gh.appel('GET', `/repos/${repo}/pulls/${Number(o.pr)}`, jeton);
      await gh.appel('POST', `/repos/${repo}/statuses/${p.head.sha}`, jeton, { state: o.etat, context: 'agents/' + o.contexte, description: String(o.description || role).slice(0, 140) });
      return console.log(`Feu agents/${o.contexte} = ${o.etat} sur la PR #${o.pr}`);
    }
    case 'fusionner': {
      if (role !== 'devops') throw new gh.ErreurGithub('Seul le devops fusionne');
      const ref = `${repo}#${Number(o.pr)}`, features = await cfgBacklog.source('features').lister(), t = features.find(x => x.pr === ref);
      const groupe = t && (t.parent || features.some(x => x.parent === t.id));
      if (groupe) throw new gh.ErreurGithub(`${ref} fait partie d'une livraison groupée : fusionner --role devops --ticket ${t.parent || t.id}`);
      const { p, manque } = await gh.fusionnable(jeton, repo, Number(o.pr));
      if (manque.length) throw new gh.ErreurGithub('Fusion refusée, il manque : ' + manque.join(', '));
      await gh.appel('PUT', `/repos/${repo}/pulls/${p.number}/merge`, jeton, { merge_method: 'squash', sha: p.head.sha });
      return console.log(`PR #${p.number} fusionnée dans main`);
    }
    default: throw new gh.ErreurGithub('Commande inconnue : ' + cmd + '\n\n' + AIDE);
  }
}
// Livraison groupée : chaque PR du lot est vérifiée (CEO, revue, sécurité, pas de conflit) avec un jeton limité à son
// repo ; si une seule manque, rien n'est fusionné. Puis fusion dans l'ordre des dépendances (producteur d'abord).
async function livraisonGroupee(o, role, c, politique, fil) {
  if (role !== 'devops') throw new gh.ErreurGithub('Seul le devops fusionne');
  const src = cfgBacklog.source('features'), l = lot(await src.lister(), o.ticket), jetons = new Map();
  for (const m of l.membres) {
    if (!m.ref) continue;
    const { repo } = gh.repoDeFiliale(c, fil, m.filiale);
    if (m.ref.repo !== repo) throw new gh.ErreurGithub(`${m.id} : la PR ${m.pr} n'est pas sur le repo de ${m.filiale} (${repo})`);
  }
  const jeton = async repo => jetons.get(repo) || jetons.set(repo, await gh.jetonRole(c, politique, role, repo)).get(repo);
  const r = await livrer(l, {
    verifier: async m => { const f = await gh.fusionnable(await jeton(m.ref.repo), m.ref.repo, m.ref.numero); m.sha = f.p.head.sha; return f; },
    fusionner: async m => gh.appel('PUT', `/repos/${m.ref.repo}/pulls/${m.ref.numero}/merge`, await jeton(m.ref.repo), { merge_method: 'squash', sha: m.sha })
  });
  const noter = (id, texte) => src.commenter(id, { auteur: role, texte });
  if (r.ok) {
    for (const m of l.membres) { await src.modifier(m.id, { etape: '8 · Livraison' }); await noter(m.id, `Fusionnée dans main (livraison groupée ${l.parent.id}) : ${m.pr}`); }
    await noter(l.parent.id, `Livraison groupée faite, dans l'ordre : ${r.fusionnees.join(' → ')}`);
    return console.log(`Lot ${l.parent.id} fusionné : ${r.fusionnees.join(' → ')}`);
  }
  if (r.phase === 'verification') throw new gh.ErreurGithub(`Livraison groupée ${l.parent.id} refusée, rien n'a été fusionné. Il manque :\n  - ` + r.manques.join('\n  - '));
  // Fusion partielle : impossible à annuler automatiquement, on bloque le ticket et on dit exactement l'état
  const etat = `Livraison groupée ${l.parent.id} INTERROMPUE : fusionnées ${r.fusionnees.join(', ') || 'aucune'} ; échec ${r.echec.id} (${r.echec.erreur}) ; non fusionnées ${r.restantes.join(', ') || 'aucune'}. Décision du CEO requise (corriger et relancer, ou revert des PR fusionnées).`;
  await src.modifier(l.parent.id, { statut: 'Bloqué' }); await noter(l.parent.id, etat);
  throw new gh.ErreurGithub(etat);
}

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e instanceof gh.ErreurGithub ? 'Erreur : ' + e.message : 'Erreur : ' + (e.message || e)); process.exit(1); });
module.exports = { main };
