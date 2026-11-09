#!/usr/bin/env node
// Applique droits/roles.json aux fichiers d'agents : outils autorisés (tools) et skills préchargées (skills).
// roles.json reste la source unique ; la consigne de chaque agent n'est jamais modifiée.
//   node siege/droits.js verifier   → écarts entre roles.json, agents et skills présentes (code 1 s'il y en a)
//   node siege/droits.js appliquer  → réécrit tools et skills de chaque agent
//   node siege/droits.js matrice    → tableau lisible des droits par rôle
'use strict';
const fs = require('fs'), path = require('path');
const RACINE = path.resolve(__dirname, '..');
const { Agents } = require('./lib/agents');

const politique = () => JSON.parse(fs.readFileSync(path.join(RACINE, 'droits', 'roles.json'), 'utf8'));
const skillsPresentes = () => { try { return fs.readdirSync(path.join(RACINE, '.claude', 'skills')).filter(d => fs.existsSync(path.join(RACINE, '.claude', 'skills', d, 'SKILL.md'))); } catch { return []; } };

// Ce qu'un agent doit avoir d'après roles.json (le directeur n'est pas un fichier d'agent)
function attendu(p, role) {
  const r = p.roles[role], c = p.commun;
  return { outils: [...new Set([...c.outils_toujours, ...r.outils])].filter(o => o !== 'Agent'), skills: [...new Set([...(c.skills || []), ...(r.skills || []), ...(r.skills_entreprise || [])])] };
}

async function ecarts() {
  const p = politique(), ag = await new Agents(path.join(RACINE, '.claude', 'agents')).lister(), sk = new Set(skillsPresentes()), out = [];
  for (const role of Object.keys(p.roles).filter(r => r !== 'directeur')) {
    const a = ag.find(x => x.nom === role), e = attendu(p, role);
    if (!a) { out.push(`${role} : déclaré dans roles.json mais aucun fichier .claude/agents/${role}.md`); continue; }
    const diff = (x, y) => x.filter(v => !y.includes(v));
    if (diff(e.outils, a.outils).length || diff(a.outils, e.outils).length) out.push(`${role} : outils ${a.outils.join(',')} ≠ attendu ${e.outils.join(',')}`);
    if (diff(e.skills, a.skills).length || diff(a.skills, e.skills).length) out.push(`${role} : skills ${a.skills.join(',') || '—'} ≠ attendu ${e.skills.join(',')}`);
    for (const s of e.skills) if (!sk.has(s)) out.push(`${role} : skill « ${s} » absente de .claude/skills/`);
  }
  for (const a of ag) if (!p.roles[a.nom]) out.push(`${a.nom} : agent sans droits dans roles.json (la garde refusera toutes ses actions)`);
  return out;
}

async function appliquer({ silencieux = false } = {}) {
  const p = politique(), reserves = require('./lib/identite').rolesReserves(p);
  if (reserves.length) throw new Error('Rôle d\'agent nommé comme une identité humaine (commun.identites_humaines) : ' + reserves.join(', '));
  const agents = new Agents(path.join(RACINE, '.claude', 'agents'));
  for (const a of await agents.lister()) {
    if (!p.roles[a.nom]) continue;
    const e = attendu(p, a.nom);
    await agents.ecrire({ ...a, outils: e.outils, skills: e.skills }, { creation: false });
    if (!silencieux) console.log(`${a.nom.padEnd(16)} outils: ${e.outils.join(', ')}\n${''.padEnd(16)} skills: ${e.skills.join(', ')}`);
  }
  require('./lib/parametres').generer(RACINE);
  // Mêmes agents pour GitHub Copilot CLI (.github/agents, .github/skills), garde en hook
  const c = require('./lib/copilot-agents').generer(RACINE, p, attendu);
  if (!silencieux) console.log(`\n.github/agents : ${c.length} agents Copilot générés ; .github/skills copié.`);
}

function matrice() {
  const p = politique();
  for (const [role, r] of Object.entries(p.roles)) {
    console.log(`\n■ ${role} — ${r.libelle}`);
    console.log('  écrit dans : ' + (r.ecriture.join(', ') || 'rien (passe par l\'outil backlog)'));
    console.log('  commandes  : ' + (r.bash.length ? r.bash.length + ' règle(s) propre(s) + communes' : 'communes seulement (lecture du backlog, git en lecture)'));
    console.log('  GitHub     : ' + (Object.entries(r.github).map(([k, v]) => k + ':' + v).join(', ') || 'aucun'));
    console.log('  web        : ' + (r.web.join(', ') || 'aucun (GitHub et Notion seulement via les outils du Siège)'));
    console.log('  skills     : ' + [...(p.commun.skills || []), ...(r.skills || []), ...(r.skills_entreprise || [])].join(', '));
  }
}

const cmd = process.argv[2];
if (require.main === module) (async () => {
  if (cmd === 'appliquer') { await appliquer(); console.log('\n.claude/settings.json régénéré (garde, bac à sable, réseau GitHub + Notion).'); const e = await ecarts(); if (e.length) { console.error('\nÉcarts restants :\n- ' + e.join('\n- ')); process.exit(1); } return; }
  if (cmd === 'verifier') { const e = await ecarts(); if (e.length) { console.log('Écarts :\n- ' + e.join('\n- ')); process.exit(1); } console.log('Agents conformes à droits/roles.json.'); return; }
  if (cmd === 'matrice') return matrice();
  console.log('Usage : node siege/droits.js verifier | appliquer | matrice');
})().catch(e => { console.error('Erreur : ' + e.message); process.exit(1); });
module.exports = { ecarts, attendu, appliquer, politique, skillsPresentes };
