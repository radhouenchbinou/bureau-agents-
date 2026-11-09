// Microsoft Teams : même rôle que Telegram et Slack (collaborateurs ↔ directeur, notifications du CEO), sans adresse
// publique. Un compte Microsoft 365 dédié, « Directeur », reçoit les conversations 1:1 de Teams ; le Siège les lit par
// Microsoft Graph toutes les quelques secondes et répond depuis ce compte.
//   - App Entra (inscription d'application) : client public (« Allow public client flows »), permissions déléguées
//     User.Read, Chat.ReadWrite, offline_access, consentement de l'administrateur ;
//   - connexion du compte Directeur depuis le Siège par code d'appareil (aucun mot de passe stocké) ; jetons dans
//     ~/.siege/teams-token.json (600), rafraîchis automatiquement.
// État privé ~/.siege/teams.json : { actif, tenant, clientId, moi, ceo, collaborateurs, enAttente, notifies, nouvelle,
//   chats: { <id utilisateur>: <id conversation> }, vus: { <id conversation>: <date du dernier message traité> } }.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const PRIVE = () => process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege');
const F_ETAT = () => path.join(PRIVE(), 'teams.json'), F_JETON = () => path.join(PRIVE(), 'teams-token.json');
const LOGIN = () => process.env.TEAMS_LOGIN_URL || 'https://login.microsoftonline.com';
const GRAPH = () => process.env.TEAMS_GRAPH_URL || 'https://graph.microsoft.com/v1.0';
const SCOPE = 'offline_access User.Read Chat.ReadWrite';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT = /^([0-9a-f-]{36}|[a-z0-9.-]+\.[a-z]{2,}|organizations)$/i;

class ErreurTeams extends Error {}
const refus = m => { throw new ErreurTeams(m); };
function ecrireAtomique(f, contenu) { fs.mkdirSync(PRIVE(), { recursive: true, mode: 0o700 }); const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, contenu, { mode: 0o600 }); fs.renameSync(t, f); try { fs.chmodSync(f, 0o600); } catch {} }
const vide = () => ({ actif: false, tenant: '', clientId: '', moi: null, ceo: null, collaborateurs: [], enAttente: [], fils: {}, notifies: {}, nouvelle: {}, chats: {}, vus: {} });
function lire() { try { return { ...vide(), ...JSON.parse(fs.readFileSync(F_ETAT(), 'utf8')) }; } catch { return vide(); } }
function ecrire(e) { const g = (o, n) => Object.fromEntries(Object.entries(o || {}).slice(-n)); ecrireAtomique(F_ETAT(), JSON.stringify({ ...e, notifies: g(e.notifies, 1000), vus: g(e.vus, 500), chats: g(e.chats, 500) }, null, 1)); }
function modifier(fn) { const e = lire(); const r = fn(e); ecrire(e); return r; }

function configurer({ tenant, clientId }) {
  tenant = String(tenant || '').trim(); clientId = String(clientId || '').trim();
  if (!TENANT.test(tenant)) refus('Tenant attendu : ID d\'annuaire (GUID) ou domaine (entreprise.onmicrosoft.com)');
  if (!GUID.test(clientId)) refus('ID d\'application (client) attendu : GUID de l\'inscription d\'application Entra');
  modifier(s => { if (s.tenant !== tenant || s.clientId !== clientId) { s.moi = null; s.chats = {}; s.vus = {}; } s.tenant = tenant; s.clientId = clientId; });
}

// ---------- Jetons : code d'appareil, rafraîchissement ----------
const lireJetons = () => { try { return JSON.parse(fs.readFileSync(F_JETON(), 'utf8')); } catch { return null; } };
const connecte = () => !!(lireJetons() || {}).refresh_token;
async function formulaire(chemin, params) {
  let r; try { r = await fetch(LOGIN() + chemin, { method: 'POST', signal: AbortSignal.timeout(20e3), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) }); }
  catch (e) { refus('Microsoft injoignable : ' + (e.cause && e.cause.code || e.message)); }
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
function garderJetons(j) { ecrireAtomique(F_JETON(), JSON.stringify({ access_token: j.access_token, refresh_token: j.refresh_token, expire: Date.now() + (Number(j.expires_in) || 3600) * 1e3 - 60e3 })); }

// Démarre la connexion : renvoie le code à saisir et attend en tâche de fond que le compte Directeur se connecte
async function connexion() {
  const e = lire(); if (!e.tenant || !e.clientId) refus('Renseignez d\'abord le tenant et l\'ID d\'application');
  const { status, j } = await formulaire(`/${e.tenant}/oauth2/v2.0/devicecode`, { client_id: e.clientId, scope: SCOPE });
  if (status !== 200) refus('Connexion refusée par Microsoft : ' + (j.error_description || j.error || status));
  const attente = (async () => {
    const fin = Date.now() + (Number(j.expires_in) || 900) * 1e3; let pas = (Number(j.interval) || 5) * 1e3;
    while (Date.now() < fin) {
      await new Promise(r => setTimeout(r, pas));
      const t = await formulaire(`/${e.tenant}/oauth2/v2.0/token`, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: e.clientId, device_code: j.device_code });
      if (t.status === 200) { garderJetons(t.j); const m = await graphe('GET', '/me'); modifier(s => { s.moi = { id: m.id, nom: m.displayName || m.userPrincipalName || 'Directeur' }; }); return true; }
      if (t.j.error === 'slow_down') pas += 5e3; else if (t.j.error !== 'authorization_pending') return false;
    }
    return false;
  })().catch(() => false);
  return { code: j.user_code, url: j.verification_uri || 'https://microsoft.com/devicelogin', message: j.message || '', attente };
}
async function jetonAcces() {
  const t = lireJetons(); if (!t || !t.refresh_token) refus('Compte Directeur non connecté (Siège › Intégrations › Teams)');
  if (t.access_token && t.expire > Date.now()) return t.access_token;
  const e = lire(), { status, j } = await formulaire(`/${e.tenant}/oauth2/v2.0/token`, { grant_type: 'refresh_token', client_id: e.clientId, refresh_token: t.refresh_token, scope: SCOPE });
  if (status !== 200) refus('Session Teams expirée : reconnectez le compte Directeur (' + (j.error || status) + ')');
  garderJetons({ ...j, refresh_token: j.refresh_token || t.refresh_token }); return j.access_token;
}
function deconnecter() { try { fs.unlinkSync(F_JETON()); } catch {} modifier(s => { s.moi = null; s.actif = false; }); }

async function graphe(methode, chemin, corps) {
  const jeton = await jetonAcces(); let r;
  try { r = await fetch(chemin.startsWith('http') ? chemin : GRAPH() + chemin, { method: methode, signal: AbortSignal.timeout(20e3), body: corps ? JSON.stringify(corps) : undefined, headers: { Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' } }); }
  catch (e) { refus('Microsoft Graph injoignable : ' + (e.cause && e.cause.code || e.message)); }
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) refus('Microsoft Graph ' + r.status + ' : ' + ((j.error && j.error.message) || 'erreur'));
  return j;
}

// Texte brut d'un message Teams (corps HTML)
function texte(body) {
  const t = String(body && body.content || '');
  if ((body && body.contentType) !== 'html') return t.trim();
  return t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
}

// Conversation 1:1 avec une personne (créée si besoin) puis message texte ; renvoie l'id du message
async function envoyer(userId, contenu) {
  const e = lire(); if (!e.moi) refus('Compte Directeur non connecté');
  let chat = e.chats[userId];
  if (!chat) {
    const m = id => ({ '@odata.type': '#microsoft.graph.aadUserConversationMember', roles: ['owner'], 'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${id}')` });
    chat = (await graphe('POST', '/chats', { chatType: 'oneOnOne', members: [m(e.moi.id), m(userId)] })).id;
    modifier(s => { s.chats[userId] = chat; });
  }
  const r = await graphe('POST', `/chats/${encodeURIComponent(chat)}/messages`, { body: { contentType: 'text', content: String(contenu).slice(0, 4000) } });
  modifier(s => { if (r.createdDateTime && (!s.vus[chat] || r.createdDateTime > s.vus[chat])) s.vus[chat] = r.createdDateTime; });
  return r.id;
}

// Un tour de lecture : nouvelles conversations 1:1, puis messages plus récents que le dernier traité (jamais l'historique
// d'avant la première lecture d'une conversation). surMessage({ de: {id, nom}, texte }) pour chacun, dans l'ordre.
async function tour(surMessage, { listerChats = true } = {}) {
  const e = lire(); if (!e.actif || !e.moi) return false;
  if (listerChats) {
    const l = await graphe('GET', `/me/chats?$filter=${encodeURIComponent("chatType eq 'oneOnOne'")}&$expand=members&$top=50`);
    for (const c of l.value || []) {
      const autre = (c.members || []).find(m => m.userId && m.userId !== e.moi.id);
      if (autre) modifier(s => { s.chats[autre.userId] = c.id; if (!(c.id in s.vus)) s.vus[c.id] = c.lastUpdatedDateTime || new Date().toISOString(); });
    }
  }
  for (const chat of [...new Set(Object.values(lire().chats))]) {
    const depuis = lire().vus[chat] || new Date().toISOString();
    const l = await graphe('GET', `/chats/${encodeURIComponent(chat)}/messages?$top=20&$orderby=createdDateTime desc&$filter=${encodeURIComponent('createdDateTime gt ' + depuis)}`);
    const msgs = (l.value || []).filter(m => m.createdDateTime > depuis && m.messageType === 'message' && !m.deletedDateTime).sort((a, b) => a.createdDateTime < b.createdDateTime ? -1 : 1);
    for (const m of msgs) {
      modifier(s => { s.vus[chat] = m.createdDateTime; });   // jamais deux fois le même message, même en cas d'erreur
      const u = m.from && m.from.user; if (!u || !u.id || u.id === e.moi.id) continue;
      modifier(s => { s.chats[u.id] = chat; });
      await surMessage({ de: { id: u.id, nom: String(u.displayName || u.id).slice(0, 80), username: '' }, texte: texte(m.body) });
    }
  }
  return true;
}

module.exports = { lire, ecrire, modifier, configurer, connexion, connecte, deconnecter, jetonAcces, graphe, envoyer, tour, texte, GUID, ErreurTeams };
