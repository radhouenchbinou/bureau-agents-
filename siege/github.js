#!/usr/bin/env node
// GitHub pour les agents, au nom de l'App de l'entreprise, avec un jeton limité au rôle et au repo de la filiale.
// La garde vérifie que --role est bien l'agent qui appelle ; ce script vérifie le reste (branche, droits, validations).
'use strict';
const path = require('path');
const gh = require('./lib/github');
const { filiales } = require('./lib/registre');
const garde = require('./lib/garde');

const RACINE = path.resolve(__dirname, '..');
const AIDE = `GitHub des agents — usage : node siege/github.js <commande> --role <agent> --filiale <Nom> …

  etat                                                     configuration et repos déclarés
  pousser --role R --filiale F --branche feature/ID        pousse la branche (jamais main)
  pr --role R --filiale F --branche feature/ID --titre "…" [--corps "…"]    ouvre une pull request vers main
  statut --role R --filiale F --pr N --contexte revue|securite --etat success|failure [--description "…"]
  fusionner --role devops --filiale F --pr N               fusionne si le CEO a approuvé et revue + sécurité au vert
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
  const { filiale, repo } = gh.repoDeFiliale(c, fil, o.filiale);
  const jeton = await gh.jetonRole(c, politique, role, repo);
  switch (cmd) {
    case 'pousser': {
      gh.pousser(path.join(RACINE, filiale.repo), repo, o.branche || '', jeton);
      return console.log(`Branche ${o.branche} poussée sur ${repo}`);
    }
    case 'pr': {
      if (!gh.BRANCHE.test(o.branche || '')) throw new gh.ErreurGithub('Branche feature/… ou fix/… attendue');
      const r = await gh.appel('POST', `/repos/${repo}/pulls`, jeton, { title: String(o.titre || o.branche).slice(0, 200), head: o.branche, base: 'main', body: String(o.corps || '').slice(0, 20000) + `\n\n— Ouverte par l'agent ${role} (entreprise d'agents).` });
      return console.log(`PR #${r.number} ouverte : ${r.html_url}`);
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
      const { p, manque } = await gh.fusionnable(jeton, repo, Number(o.pr));
      if (manque.length) throw new gh.ErreurGithub('Fusion refusée, il manque : ' + manque.join(', '));
      await gh.appel('PUT', `/repos/${repo}/pulls/${p.number}/merge`, jeton, { merge_method: 'squash', sha: p.head.sha });
      return console.log(`PR #${p.number} fusionnée dans main`);
    }
    default: throw new gh.ErreurGithub('Commande inconnue : ' + cmd + '\n\n' + AIDE);
  }
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e instanceof gh.ErreurGithub ? 'Erreur : ' + e.message : 'Erreur : ' + (e.message || e)); process.exit(1); });
module.exports = { main };
