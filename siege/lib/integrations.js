// Intégrations configurées par le CEO depuis le Siège : App GitHub (portfolio/github.json + clé privée dans ~/.siege)
// et vue d'ensemble sans secret (Notion, Jira, GitHub). Les jetons et la clé ne repartent jamais vers le navigateur.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const gh = require('./github');

class ErreurIntegration extends Error {}
const refus = m => { throw new ErreurIntegration(m); };
const F_GH = racine => path.join(racine, 'portfolio', 'github.json');
const F_PEM = prive => path.join(prive, 'github-app.pem');

function ecrireAtomique(f, contenu, mode) {
  fs.mkdirSync(path.dirname(f), { recursive: true, ...(mode ? { mode: 0o700 } : {}) });
  const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, contenu, mode ? { mode } : undefined); fs.renameSync(t, f);
  if (mode) fs.chmodSync(f, mode);
}

// repos : { "<dossier du repo local, colonne Repo git du registre>": "owner/repo" } ; seuls les dossiers des filiales
function configurerGithub(racine, filiales, { url = 'https://github.com', app_id, installation_id, repos = {} }) {
  const h = gh.hote(url);   // refuse une adresse invalide
  if (!/^\d{1,12}$/.test(String(app_id || ''))) refus('App ID : nombre attendu (page de l\'App › About)');
  if (!/^\d{1,14}$/.test(String(installation_id || ''))) refus('Installation ID : nombre attendu (fin de l\'URL d\'installation)');
  const dossiers = new Set(filiales.map(f => f.repo).filter(r => r && r !== '—')), propre = {};
  for (const [d, r] of Object.entries(repos)) {
    if (!r) continue;
    if (!dossiers.has(d)) refus(`Dossier inconnu du registre des filiales : ${d}`);
    if (!gh.REPO.test(r)) refus(`Repo GitHub attendu au format compte/repo : ${r}`);
    propre[d] = r;
  }
  ecrireAtomique(F_GH(racine), JSON.stringify({ url: h.web, app_id: Number(app_id), installation_id: Number(installation_id), repos: propre }, null, 2) + '\n');
  try { require('./parametres').generer(racine); } catch {}   // le bac à sable autorise l'hôte GitHub choisi
  return { repos: Object.keys(propre).length, type: h.type };
}

function enregistrerCle(prive, pem) {
  pem = String(pem || '').trim() + '\n';
  if (!/^-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+-----END (RSA )?PRIVATE KEY-----\n$/.test(pem)) refus('Clé privée de l\'App attendue (fichier .pem téléchargé depuis GitHub)');
  try { crypto.createPrivateKey(pem); } catch { refus('Clé privée illisible'); }
  ecrireAtomique(F_PEM(prive), pem, 0o600);
}

// Vérifie l'App de bout en bout : la clé signe, l'installation existe, et chaque repo déclaré lui est accessible
async function testerGithub(racine) {
  const c = gh.config(racine);
  const app = await gh.appel('GET', '/app', gh.jwtApp(c.app_id, c.pem));
  const j = await gh.appel('POST', `/app/installations/${c.installation_id}/access_tokens`, gh.jwtApp(c.app_id, c.pem), { permissions: { metadata: 'read' } });
  const vus = new Set(); let page = 1, r;
  do { r = await gh.appel('GET', `/installation/repositories?per_page=100&page=${page++}`, j.token); for (const x of r.repositories || []) vus.add(x.full_name); } while ((r.repositories || []).length === 100);
  const declares = Object.values(c.repos || {});
  return { app: app.name || app.slug || '', accessibles: [...vus].sort(), manquants: declares.filter(x => !vus.has(x)) };
}

// Ce que voit le CEO : présence des secrets, jamais leur valeur
function vue({ racine, prive, source, jetonNotion, jetonJira, filiales }) {
  let g = null; try { g = JSON.parse(fs.readFileSync(F_GH(racine), 'utf8')); } catch {}
  const j = source.url ? { url: source.url, mode: source.mode, email: source.email || '', projet: source.projet, etiquette: source.etiquette,
    types: source.types, statuts: source.statuts || {}, restreindre: !!source.restreindre, initialise: !!(source.champs && source.champs.ID) } : null;
  return {
    actif: source.type,
    notion: { jeton: !!jetonNotion, configure: !!(source.bases && source.bases.features && source.bases.bugs) },
    jira: { jeton: !!jetonJira, config: j },
    github: { configure: !!g, url: g && g.url || 'https://github.com', type: gh.hote(g && g.url).type, cle: fs.existsSync(F_PEM(prive)), app_id: g ? g.app_id : '', installation_id: g ? g.installation_id : '',
      repos: g ? g.repos || {} : {}, dossiers: [...new Set(filiales.map(f => f.repo).filter(r => r && r !== '—'))] }
  };
}

module.exports = { configurerGithub, enregistrerCle, testerGithub, vue, ErreurIntegration };
