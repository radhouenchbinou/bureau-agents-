// Agents de l'entreprise : fichiers `.claude/agents/<nom>.md` (frontmatter YAML simple + consigne).
// Lus et écrits par le Siège ; le format reste celui de Claude Code.
'use strict';
const fsp = require('fs').promises, path = require('path');
const { ErreurBacklog } = require('./backlog');

const NOM = /^[a-z][a-z0-9-]{1,40}$/;
const MODELES = ['', 'inherit', 'haiku', 'sonnet', 'opus'];
const OUTILS = ['Read', 'Grep', 'Glob', 'Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch', 'Skill', 'TodoWrite', 'ToolSearch', 'BashOutput'];
const SKILL = /^[a-z0-9][a-z0-9-]{1,63}$/;
// Rôles de filiale : un exemplaire par filiale ; les autres sont des services partagés
const ROLES_FILIALE = ['product-owner', 'dev-backend', 'dev-frontend', 'qa'];
const CONNUS = ['name', 'description', 'tools', 'model', 'skills'];

const refus = m => { throw new ErreurBacklog(m); };

// Frontmatter YAML simple : « clé: valeur », listes « - x » sous une clé ; les autres clés sont gardées telles quelles
function analyser(txt, fichier) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(txt);
  if (!m) return null;
  const meta = {}, autres = []; let cle = null;
  for (const l of m[1].split(/\r?\n/)) {
    const k = /^([\w-]+):\s*(.*)$/.exec(l);
    if (k) { cle = k[1]; if (CONNUS.includes(cle)) meta[cle] = k[2].trim() ? k[2].trim() : []; else autres.push(l); continue; }
    const li = /^\s+-\s+(.+)$/.exec(l);
    if (li && cle && CONNUS.includes(cle) && Array.isArray(meta[cle])) { meta[cle].push(li[1].trim()); continue; }
    if (cle && !CONNUS.includes(cle)) autres.push(l);
  }
  if (!meta.name) return null;
  const liste = v => Array.isArray(v) ? v : String(v || '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    nom: meta.name, description: meta.description || '', modele: typeof meta.model === 'string' ? meta.model : '',
    outils: liste(meta.tools), skills: liste(meta.skills), autres: autres.join('\n'), consigne: m[2].trim(),
    portee: ROLES_FILIALE.includes(meta.name) ? 'filiale' : 'groupe', fichier: path.basename(fichier)
  };
}
const uneLigne = s => String(s || '').replace(/[\r\n]+/g, ' ').trim();
function formater(a) {
  const l = ['---', 'name: ' + a.nom, 'description: ' + uneLigne(a.description)];
  if (a.outils && a.outils.length) l.push('tools: ' + a.outils.join(', '));
  if (a.modele) l.push('model: ' + a.modele);
  if (a.skills && a.skills.length) l.push('skills:', ...a.skills.map(s => '  - ' + s));
  if (a.autres) l.push(a.autres);
  return l.join('\n') + '\n---\n' + String(a.consigne || '').trim() + '\n';
}
function valider(a) {
  if (!NOM.test(a.nom || '')) refus('Nom d\'agent : minuscules, chiffres et tirets (ex. data-engineer)');
  if (!uneLigne(a.description)) refus('Description obligatoire : elle dit au directeur quand faire appel à cet agent');
  if (!MODELES.includes(a.modele || '')) refus('Modèle inconnu');
  const outils = Array.isArray(a.outils) ? a.outils : [];
  for (const o of outils) if (!OUTILS.includes(o)) refus('Outil inconnu : ' + o);
  const skills = Array.isArray(a.skills) ? a.skills : [];
  for (const s of skills) if (!SKILL.test(s)) refus('Nom de skill invalide : ' + s);
  if (!String(a.consigne || '').trim()) refus('Consigne vide');
  return { nom: a.nom, description: uneLigne(a.description).slice(0, 600), modele: a.modele || '', outils, skills, autres: typeof a.autres === 'string' ? a.autres : '', consigne: String(a.consigne).slice(0, 20000) };
}

class Agents {
  constructor(dossier) { this.dossier = dossier; }
  async lister() {
    let fs = []; try { fs = (await fsp.readdir(this.dossier)).filter(f => f.endsWith('.md')); } catch {}
    const out = [];
    for (const f of fs) { const a = analyser(await fsp.readFile(path.join(this.dossier, f), 'utf8'), f); if (a) out.push(a); }
    return out.sort((a, b) => a.portee.localeCompare(b.portee) || a.nom.localeCompare(b.nom));
  }
  async ecrire(a, { creation }) {
    const v = valider(a), f = path.join(this.dossier, v.nom + '.md');
    const existe = await fsp.access(f).then(() => true, () => false);
    if (creation && existe) refus('Un agent porte déjà ce nom');
    if (!creation && !existe) refus('Agent introuvable');
    await fsp.mkdir(this.dossier, { recursive: true });
    const tmp = f + '.tmp'; await fsp.writeFile(tmp, formater(v)); await fsp.rename(tmp, f);
    return analyser(formater(v), f);
  }
  async supprimer(nom) {
    if (!NOM.test(nom || '')) refus('Nom invalide');
    await fsp.unlink(path.join(this.dossier, nom + '.md')).catch(() => refus('Agent introuvable'));
  }
}

module.exports = { Agents, analyser, formater, valider, MODELES, OUTILS, ROLES_FILIALE, SKILL };
