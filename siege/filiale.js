#!/usr/bin/env node
// Intégrer une filiale (utilisé par /nouvelle-filiale, après validation du CEO) : le directeur n'écrit aucun fichier
// lui-même, et aucun agent n'écrit de CLAUDE.md ; cet outil crée la fiche (jamais par-dessus une fiche existante),
// les dossiers docs/ et la ligne du registre, et rien d'autre.
'use strict';
const fs = require('fs'), path = require('path');
const { filiales } = require('./lib/registre');
const { options, ErreurSiege } = require('./lib/options');
const identite = require('./lib/identite');

const RACINE = process.env.SIEGE_RACINE || path.resolve(__dirname, '..');
const REGISTRE = path.join(RACINE, 'portfolio', 'filiales.md');
const AIDE = `Filiales — usage : node siege/filiale.js <commande>

  liste
  ajouter --nom "<Nom>" --prefixe ABC --dossier projets/<repo>[/<sous-dossier>] [--repo projets/<repo>] --fiche "<markdown de la fiche>"
          (une filiale = un repo : --repo vaut --dossier par défaut ; la fiche validée par le CEO)
`;
class ErreurFiliale extends Error {}
const refus = m => { throw new ErreurFiliale(m); };

async function ajouter(o) {
  const nom = String(o.nom || '').replace(/[|`\u0000-\u001f]/g, '').trim();
  if (!nom || nom.length > 40) refus('--nom : 1 à 40 caractères, sans | ni `');
  if (!/^[A-Z]{3}$/.test(o.prefixe || '') || ['BUG', 'DEM', 'EXC', 'AUT'].includes(o.prefixe)) refus('--prefixe : 3 majuscules (BUG, DEM, EXC, AUT réservés)');
  const relatif = d => { const r = path.posix.normalize(String(d || '').replace(/\\/g, '/')); if (!/^projets\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(r) || r.split('/').includes('..')) refus('Dossier attendu sous projets/ : ' + d); return r; };
  const dossier = relatif(o.dossier), repo = relatif(o.repo || o.dossier);
  if (!(dossier === repo || dossier.startsWith(repo + '/'))) refus('--dossier doit être dans --repo');
  const abs = path.join(RACINE, dossier);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) refus('Dossier introuvable : ' + dossier + ' (clonez d\'abord le repo dans projets/)');
  const fiche = String(o.fiche || '').trim();
  if (fiche.length < 80) refus('--fiche : le contenu de la fiche validée par le CEO (templates/fiche-filiale.md)');
  const deja = await filiales(REGISTRE);
  if (deja.some(f => f.prefixe === o.prefixe)) refus('Préfixe déjà utilisé : ' + o.prefixe);
  if (deja.some(f => f.nom.toLowerCase() === nom.toLowerCase())) refus('Filiale déjà déclarée : ' + nom);
  if (deja.some(f => f.dossier === dossier)) refus('Dossier déjà déclaré : ' + dossier);
  const f = path.join(abs, 'CLAUDE.md');
  if (fs.existsSync(f)) refus(dossier + '/CLAUDE.md existe déjà : il n\'est jamais écrasé (le CEO le modifie lui-même)');
  fs.writeFileSync(f, fiche + '\n', { flag: 'wx' });
  for (const d of ['backlog', 'adr', 'rapports']) { fs.mkdirSync(path.join(abs, 'docs', d), { recursive: true }); const k = path.join(abs, 'docs', d, '.gitkeep'); if (!fs.readdirSync(path.dirname(k)).length) fs.writeFileSync(k, ''); }
  // Ligne ajoutée au tableau, juste après sa dernière ligne (avant le texte qui le suit)
  let txt = ''; try { txt = fs.readFileSync(REGISTRE, 'utf8'); } catch { txt = '# Registre des filiales\n\n| Filiale | Préfixe | Dossier | Repo git | Statut |\n|---|---|---|---|---|\n'; }
  const lignes = txt.split('\n'), derniere = lignes.reduce((k, l, i) => /^\|/.test(l) ? i : k, -1);
  const ligne = `| ${nom} | ${o.prefixe} | \`${dossier}\` | \`${repo}\` | Active |`;
  if (derniere < 0) lignes.push('| Filiale | Préfixe | Dossier | Repo git | Statut |', '|---|---|---|---|---|', ligne); else lignes.splice(derniere + 1, 0, ligne);
  const t = REGISTRE + '.tmp'; fs.mkdirSync(path.dirname(REGISTRE), { recursive: true }); fs.writeFileSync(t, lignes.join('\n')); fs.renameSync(t, REGISTRE);
  return { nom, prefixe: o.prefixe, dossier, repo };
}

async function main(argv) {
  const [cmd, ...a] = argv, { o } = options(a);
  identite.resoudre({ outil: 'filiale', args: argv });
  if (!cmd || cmd === 'aide') return console.log(AIDE);
  if (cmd === 'liste') return (await filiales(REGISTRE)).forEach(f => console.log(`${f.prefixe}  ${f.nom.padEnd(16)} ${f.dossier}  (repo ${f.repo || '—'})`));
  if (cmd === 'ajouter') { const r = await ajouter(o); return console.log(`Filiale ${r.nom} (${r.prefixe}) intégrée : fiche ${r.dossier}/CLAUDE.md, docs/, registre mis à jour.`); }
  refus('Commande inconnue : ' + cmd + '\n\n' + AIDE);
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e instanceof ErreurFiliale || e instanceof ErreurSiege ? 'Erreur : ' + e.message : e); process.exit(1); });
module.exports = { main, ajouter, ErreurFiliale };
