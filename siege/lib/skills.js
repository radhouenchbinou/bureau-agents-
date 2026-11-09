// Skills des agents : socle fourni avec l'entreprise (droits/roles.json › skills) et skills « entreprise »
// ajoutées par le CEO pour un type d'agent (› skills_entreprise). Fichiers dans .claude/skills/<nom>/SKILL.md.
// Toute modification réapplique roles.json aux agents (outils + skills préchargées).
'use strict';
const fs = require('fs'), path = require('path');
const { ErreurBacklog } = require('./backlog');

const NOM = /^[a-z0-9][a-z0-9-]{1,63}$/;
const refus = m => { throw new ErreurBacklog(m); };
const dossier = racine => path.join(racine, '.claude', 'skills');
const fRoles = racine => path.join(racine, 'droits', 'roles.json');
const lireRoles = racine => JSON.parse(fs.readFileSync(fRoles(racine), 'utf8'));
function ecrireRoles(racine, p) { const t = fRoles(racine) + '.tmp'; fs.writeFileSync(t, JSON.stringify(p, null, 2) + '\n'); fs.renameSync(t, fRoles(racine)); }

// Skills du socle : référencées par commun.skills ou roles.*.skills (non supprimables depuis le Siège)
const socle = p => new Set([...(p.commun.skills || []), ...Object.values(p.roles).flatMap(r => r.skills || [])]);

function lister(racine) {
  const p = lireRoles(racine), base = socle(p);
  let noms = []; try { noms = fs.readdirSync(dossier(racine)).filter(n => fs.existsSync(path.join(dossier(racine), n, 'SKILL.md'))); } catch {}
  return noms.sort().map(nom => {
    const txt = fs.readFileSync(path.join(dossier(racine), nom, 'SKILL.md'), 'utf8'), d = /^description:\s*(.+)$/m.exec(txt);
    const roles = Object.entries(p.roles).filter(([, r]) => (r.skills || []).includes(nom) || (r.skills_entreprise || []).includes(nom)).map(([k]) => k);
    return { nom, description: d ? d[1].trim() : '', socle: base.has(nom), commune: (p.commun.skills || []).includes(nom), roles };
  });
}

function creer(racine, { nom, description, contenu, roles = [] }) {
  if (!NOM.test(nom || '')) refus('Nom de skill : minuscules, chiffres et tirets (ex. conventions-api-kompta)');
  description = String(description || '').replace(/[\r\n]+/g, ' ').trim();
  if (description.length < 20) refus('Description obligatoire : elle dit à l\'agent quand utiliser la skill (20 caractères minimum)');
  contenu = String(contenu || '').trim(); if (contenu.length < 20) refus('Contenu de la skill trop court');
  const d = path.join(dossier(racine), nom); if (fs.existsSync(d)) refus('Une skill porte déjà ce nom');
  const p = lireRoles(racine); for (const r of roles) if (!p.roles[r] || r === 'directeur') refus('Rôle inconnu : ' + r);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'SKILL.md'), `---\nname: ${nom}\ndescription: ${description.slice(0, 1000)}\n---\n${contenu.slice(0, 50000)}\n`);
  for (const r of roles) p.roles[r].skills_entreprise = [...new Set([...(p.roles[r].skills_entreprise || []), nom])];
  ecrireRoles(racine, p);
}

function affecter(racine, { nom, role, actif }) {
  const p = lireRoles(racine);
  if (!p.roles[role] || role === 'directeur') refus('Rôle inconnu');
  if (!fs.existsSync(path.join(dossier(racine), nom || '', 'SKILL.md'))) refus('Skill introuvable');
  if (socle(p).has(nom) && (p.roles[role].skills || []).includes(nom)) refus('Skill du socle de ce rôle : elle se modifie dans droits/roles.json');
  const l = new Set(p.roles[role].skills_entreprise || []); actif ? l.add(nom) : l.delete(nom);
  p.roles[role].skills_entreprise = [...l]; ecrireRoles(racine, p);
}

function supprimer(racine, nom) {
  const p = lireRoles(racine); if (!NOM.test(nom || '')) refus('Nom invalide');
  if (socle(p).has(nom)) refus('Skill du socle : non supprimable depuis le Siège');
  for (const r of Object.values(p.roles)) if (r.skills_entreprise) r.skills_entreprise = r.skills_entreprise.filter(s => s !== nom);
  ecrireRoles(racine, p);
  fs.rmSync(path.join(dossier(racine), nom), { recursive: true, force: true });
}

module.exports = { lister, creer, affecter, supprimer };
