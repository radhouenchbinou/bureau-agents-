// Moteurs d'agents présents sur la machine (Claude Code, Codex, Gemini CLI…) et leurs modèles, activables par le CEO.
// Réglages dans droits/moteurs.json (hors de portée des agents : droits/ est interdit en écriture) :
//   { "moteurs": { "<nom>": { "actif": bool, "modeles": { "<id>": bool }, "ajoutes": ["<id>"] } } }
// Par défaut : Claude Code actif avec tous ses modèles ; les autres moteurs inactifs tant que le CEO ne les active pas.
'use strict';
const fs = require('fs'), path = require('path'), { execFile } = require('child_process');

const RACINE = () => process.env.SIEGE_RACINE || path.resolve(__dirname, '..', '..');
const F = () => path.join(RACINE(), 'droits', 'moteurs.json');
const MODELE = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,79}$/;

class ErreurMoteur extends Error {}
const refus = m => { throw new ErreurMoteur(m); };

const sortie = (bin, args, ms = 15e3) => new Promise(ok => execFile(bin, args, { timeout: ms, maxBuffer: 8 << 20, env: process.env }, (e, out) => ok(e ? null : String(out))));

// Catalogue Claude : Claude Code n'a pas de commande qui liste ses modèles ; alias acceptés par les agents (model: opus…)
const CLAUDE = [
  { id: 'claude-opus-5-5', libelle: 'Claude Opus 5.5', alias: 'opus' },
  { id: 'claude-sonnet-5-5', libelle: 'Claude Sonnet 5.5', alias: 'sonnet' },
  { id: 'claude-haiku-5-5', libelle: 'Claude Haiku 5.5', alias: 'haiku' },
  { id: 'claude-fable-5-1', libelle: 'Claude Fable 5.1' }
];
const MOTEURS = {
  claude: { libelle: 'Claude Code', bin: () => process.env.CLAUDE_BIN || 'claude', sousAgents: true,
    modeles: async () => CLAUDE.map(m => ({ ...m, source: 'catalogue' })) },
  // Codex donne son catalogue : `codex debug models` (modèles visibles seulement)
  codex: { libelle: 'Codex', bin: () => process.env.CODEX_BIN || 'codex', externe: true,
    modeles: async bin => {
      const t = await sortie(bin, ['debug', 'models'], 30e3); let j; try { j = JSON.parse(t); } catch { return []; }
      return (j.models || []).filter(m => m.visibility === 'list' && MODELE.test(m.slug || '')).sort((a, b) => (a.priority || 99) - (b.priority || 99))
        .map(m => ({ id: m.slug, libelle: m.display_name || m.slug, source: 'détecté' }));
    } },
  gemini: { libelle: 'Gemini CLI', bin: () => process.env.GEMINI_BIN || 'gemini', modeles: async () => [] }
};

function lireConfig() { try { const j = JSON.parse(fs.readFileSync(F(), 'utf8')); return { moteurs: j.moteurs || {} }; } catch { return { moteurs: {} }; } }
function ecrireConfig(c) { const t = F() + '.' + process.pid + '.tmp'; fs.mkdirSync(path.dirname(F()), { recursive: true }); fs.writeFileSync(t, JSON.stringify(c, null, 2) + '\n'); fs.renameSync(t, F()); }
const reglage = (c, nom) => c.moteurs[nom] || { actif: nom === 'claude', modeles: {}, ajoutes: [] };
const modeleActif = (r, id) => r.modeles[id] !== false;   // un modèle est actif sauf si le CEO l'a désactivé

let cache = null, cacheA = 0;
// Détection (mise en cache 10 min) : installé ?, version, modèles (catalogue ou détectés + ajoutés par le CEO), réglages
async function detecter({ forcer = false } = {}) {
  if (!forcer && cache && Date.now() - cacheA < 600e3) return fusionner(cache);
  const out = [];
  for (const [nom, m] of Object.entries(MOTEURS)) {
    const bin = m.bin(), v = await sortie(bin, ['--version']);
    out.push({ nom, libelle: m.libelle, installe: v != null, version: v ? v.trim().split('\n')[0].slice(0, 80) : '', externe: !!m.externe, sousAgents: !!m.sousAgents,
      catalogue: v != null ? await m.modeles(bin) : [] });
  }
  cache = out; cacheA = Date.now();
  return fusionner(out);
}
function fusionner(liste) {
  const c = lireConfig();
  return liste.map(m => {
    const r = reglage(c, m.nom), ids = new Set(m.catalogue.map(x => x.id));
    const modeles = [...m.catalogue, ...(r.ajoutes || []).filter(id => !ids.has(id)).map(id => ({ id, libelle: id, source: 'ajouté' }))]
      .map(x => ({ ...x, actif: modeleActif(r, x.id) }));
    return { ...m, catalogue: undefined, actif: !!r.actif && m.installe, demande: !!r.actif, modeles };
  });
}

// Un modèle (id complet ou alias) d'un moteur est-il autorisé ? (garde, outil des agents externes)
function autorise(nom, modele) {
  const c = lireConfig(), r = reglage(c, nom);
  if (!r.actif) return { ok: false, raison: `Moteur ${MOTEURS[nom] ? MOTEURS[nom].libelle : nom} désactivé par le CEO (Siège › Agents › Moteurs)` };
  if (!modele || modele === 'inherit') return { ok: true };
  const id = nom === 'claude' ? ((CLAUDE.find(m => m.alias === modele) || {}).id || modele) : modele;
  const connu = nom !== 'claude' || CLAUDE.some(m => m.id === id) || (r.ajoutes || []).includes(id);
  if (!connu && nom === 'claude') return { ok: true };       // identifiant daté (claude-…-2026…) : non catalogué, laissé passer
  return modeleActif(r, id) ? { ok: true } : { ok: false, raison: `Modèle ${id} désactivé par le CEO pour ${MOTEURS[nom] ? MOTEURS[nom].libelle : nom}` };
}

// Actions du CEO
function modifier(fn) { const c = lireConfig(); fn(c); ecrireConfig(c); }
function activerMoteur(nom, oui) { if (!MOTEURS[nom]) refus('Moteur inconnu : ' + nom); modifier(c => { c.moteurs[nom] = { ...reglage(c, nom), actif: !!oui }; }); }
function activerModele(nom, id, oui) {
  if (!MOTEURS[nom]) refus('Moteur inconnu : ' + nom); if (!MODELE.test(id || '')) refus('Modèle invalide');
  modifier(c => { const r = reglage(c, nom); c.moteurs[nom] = { ...r, modeles: { ...r.modeles, [id]: !!oui } }; });
}
function ajouterModele(nom, id) {
  if (!MOTEURS[nom]) refus('Moteur inconnu : ' + nom); id = String(id || '').trim(); if (!MODELE.test(id)) refus('Identifiant de modèle attendu (lettres, chiffres, . _ : / -)');
  modifier(c => { const r = reglage(c, nom); c.moteurs[nom] = { ...r, ajoutes: [...new Set([...(r.ajoutes || []), id])] }; });
}
function retirerModele(nom, id) { modifier(c => { const r = reglage(c, nom); const m = { ...r.modeles }; delete m[id]; c.moteurs[nom] = { ...r, modeles: m, ajoutes: (r.ajoutes || []).filter(x => x !== id) }; }); }

module.exports = { MOTEURS, CLAUDE, detecter, autorise, activerMoteur, activerModele, ajouterModele, retirerModele, lireConfig, ErreurMoteur, MODELE };
