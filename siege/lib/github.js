// Accès GitHub des agents par une App GitHub : chaque action obtient un jeton d'installation d'une heure,
// limité au seul repo de la filiale et aux seules permissions du rôle (droits/roles.json › github).
// Les agents ne voient jamais ni la clé de l'App (~/.siege/github-app.pem) ni le jeton.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { execFileSync } = require('child_process');

// Adresse GitHub de l'entreprise (portfolio/github.json › url) : github.com, GitHub Enterprise Cloud avec résidence des
// données (<nom>.ghe.com) ou GitHub Enterprise Server (<hôte>, API sous /api/v3). Variables GITHUB_*_URL pour les tests.
const RACINE = () => process.env.SIEGE_RACINE || path.resolve(__dirname, '..', '..');
const URL_OK = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(:\d{2,5})?$/i;
function hote(url) {
  const u = String(url || 'https://github.com').trim().replace(/\/+$/, '');
  if (!URL_OK.test(u)) refus('Adresse GitHub attendue : https://github.com, https://<nom>.ghe.com ou https://<serveur GitHub Enterprise>');
  const h = new URL(u).host.toLowerCase();
  if (h === 'github.com') return { type: 'github.com', web: 'https://github.com', api: 'https://api.github.com', git: 'https://github.com', domaines: ['github.com', 'api.github.com', 'codeload.github.com', '*.githubusercontent.com'] };
  if (/\.ghe\.com$/.test(h)) return { type: 'ghe.com', web: 'https://' + h, api: 'https://api.' + h, git: 'https://' + h, domaines: [h, 'api.' + h, '*.' + h] };
  return { type: 'serveur', web: 'https://' + h, api: 'https://' + h + '/api/v3', git: 'https://' + h, domaines: [h.split(':')[0]] };
}
function urlConfiguree() { try { return JSON.parse(fs.readFileSync(path.join(RACINE(), 'portfolio', 'github.json'), 'utf8')).url || ''; } catch { return ''; } }
const API = () => process.env.GITHUB_API_URL || hote(urlConfiguree()).api;
const GIT = () => process.env.GITHUB_GIT_URL || hote(urlConfiguree()).git;
const PRIVE = () => process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege');
const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const BRANCHE = /^(feature|fix)\/[A-Za-z0-9._\/-]{1,80}$/;

class ErreurGithub extends Error {}
const refus = m => { throw new ErreurGithub(m); };
const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// JWT RS256 de l'App (valable 9 min, horloge reculée de 60 s comme le recommande GitHub)
function jwtApp(appId, pem) {
  const t = Math.floor(Date.now() / 1e3), entete = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const charge = b64url(JSON.stringify({ iat: t - 60, exp: t + 540, iss: String(appId) }));
  return `${entete}.${charge}.${b64url(crypto.sign('RSA-SHA256', Buffer.from(entete + '.' + charge), pem))}`;
}

async function appel(methode, chemin, jeton, corps, type = 'Bearer') {
  const r = await fetch(API() + chemin, { method: methode, signal: AbortSignal.timeout(20e3), body: corps ? JSON.stringify(corps) : undefined,
    headers: { Authorization: type + ' ' + jeton, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'siege-agents', 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) refus(`GitHub ${r.status} : ${j.message || 'erreur'}`);
  return j;
}

// Configuration : portfolio/github.json (sans secret) + clé privée dans ~/.siege
function config(racine) {
  let c; try { c = JSON.parse(fs.readFileSync(path.join(racine, 'portfolio', 'github.json'), 'utf8')); } catch { refus('GitHub non configuré : portfolio/github.json absent (voir README › GitHub)'); }
  if (!/^\d+$/.test(String(c.app_id || '')) || !/^\d+$/.test(String(c.installation_id || ''))) refus('portfolio/github.json : app_id et installation_id attendus');
  const pemF = path.join(PRIVE(), 'github-app.pem');
  let pem; try { pem = fs.readFileSync(pemF, 'utf8'); } catch { refus('Clé privée de l\'App absente : ' + pemF); }
  return { ...c, pem };
}
// Repo GitHub de la filiale : portfolio/github.json › repos { "<dossier du repo local>": "owner/repo" }
function repoDeFiliale(c, filiales, nom) {
  const f = filiales.find(x => x.nom.toLowerCase() === String(nom || '').toLowerCase() || x.prefixe === String(nom || '').toUpperCase()) || refus('Filiale inconnue : ' + nom);
  const repo = (c.repos || {})[f.repo]; if (!REPO.test(repo || '')) refus(`Aucun repo GitHub déclaré pour ${f.nom} (${f.repo}) dans portfolio/github.json`);
  return { filiale: f, repo };
}
function permissionsDuRole(politique, role) {
  const p = ((politique.roles || {})[role] || {}).github || {};
  if (!Object.keys(p).length) refus(`Le rôle ${role} n'a aucun droit GitHub`);
  return { metadata: 'read', ...p };
}

// Jeton d'installation restreint au repo et aux permissions du rôle
async function jetonRole(c, politique, role, repo) {
  const j = await appel('POST', `/app/installations/${c.installation_id}/access_tokens`, jwtApp(c.app_id, c.pem),
    { repositories: [repo.split('/')[1]], permissions: permissionsDuRole(politique, role) });
  return j.token;
}

// git push sans exposer le jeton : en-tête passé par variables d'environnement (pas dans les arguments ni la config)
function pousser(dossierRepo, repo, branche, jeton) {
  if (!BRANCHE.test(branche)) refus('Seules les branches feature/… et fix/… se poussent (jamais main)');
  const auth = 'AUTHORIZATION: basic ' + Buffer.from('x-access-token:' + jeton).toString('base64');
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `http.${GIT()}/.extraheader`, GIT_CONFIG_VALUE_0: auth };
  const url = GIT().startsWith('file:') || GIT().startsWith('/') ? `${GIT()}/${repo}.git` : `${GIT()}/${repo}.git`;
  execFileSync('git', ['-C', dossierRepo, 'push', url, `refs/heads/${branche}:refs/heads/${branche}`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
}

// Fusion par le devops : uniquement si le CEO (un humain) a approuvé la PR et si revue + sécurité sont au vert
async function fusionnable(jeton, repo, pr) {
  const p = await appel('GET', `/repos/${repo}/pulls/${pr}`, jeton);
  if (p.state !== 'open') refus(`PR #${pr} n'est pas ouverte`);
  const avis = await appel('GET', `/repos/${repo}/pulls/${pr}/reviews?per_page=100`, jeton);
  const dernierParPersonne = new Map(); for (const a of avis) if (a.user && a.user.type === 'User') dernierParPersonne.set(a.user.login, a.state);
  const approuve = [...dernierParPersonne.values()].includes('APPROVED') && ![...dernierParPersonne.values()].includes('CHANGES_REQUESTED');
  const st = await appel('GET', `/repos/${repo}/commits/${p.head.sha}/status`, jeton);
  const etat = ctx => (st.statuses || []).find(s => s.context === ctx);
  const manque = [];
  if (!approuve) manque.push('approbation du CEO sur la PR');
  for (const ctx of ['agents/revue', 'agents/securite']) if (!etat(ctx) || etat(ctx).state !== 'success') manque.push(ctx + ' au vert');
  if (p.mergeable === false) manque.push('pas de conflit');
  return { p, manque };
}

module.exports = { hote, urlConfiguree, jwtApp, appel, config, repoDeFiliale, permissionsDuRole, jetonRole, pousser, fusionnable, ErreurGithub, BRANCHE, REPO };
