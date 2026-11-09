// Slack : même rôle que Telegram (collaborateurs ↔ directeur, notifications du CEO), activable dans Siège › Intégrations.
// App Slack en Socket Mode : le Siège ouvre lui-même une connexion WebSocket sortante vers Slack, aucune adresse publique.
// Jetons dans ~/.siege (600) ou SLACK_BOT_TOKEN (xoxb-…) / SLACK_APP_TOKEN (xapp-…, droit connections:write).
// État privé ~/.siege/slack.json : { actif, ceo, collaborateurs, enAttente, fils, notifies, nouvelle } (identifiants U…).
// WebSocket intégré à Node 22 et plus.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const PRIVE = () => process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege');
const F_ETAT = () => path.join(PRIVE(), 'slack.json');
const F_BOT = () => path.join(PRIVE(), 'slack-bot-token'), F_APP = () => path.join(PRIVE(), 'slack-app-token');
const API = () => process.env.SLACK_API_URL || 'https://slack.com/api';
const ID = /^[UW][A-Z0-9]{6,20}$/;
const disponible = () => typeof WebSocket === 'function';

// Manifeste à coller dans « Create New App › From a manifest » : bot en messages directs, boutons, Socket Mode
const MANIFESTE = {
  display_information: { name: 'Directeur (Siège)', description: 'Le directeur de programme de l\'entreprise d\'agents' },
  features: { bot_user: { display_name: 'directeur', always_online: true }, app_home: { messages_tab_enabled: true, messages_tab_read_only_enabled: false } },
  oauth_config: { scopes: { bot: ['chat:write', 'im:history', 'im:read', 'users:read'] } },
  settings: { event_subscriptions: { bot_events: ['message.im'] }, interactivity: { is_enabled: true }, socket_mode_enabled: true, org_deploy_enabled: false, token_rotation_enabled: false }
};

class ErreurSlack extends Error {}
const refus = m => { throw new ErreurSlack(m); };

function ecrireAtomique(f, contenu) {
  fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
  const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, contenu, { mode: 0o600 }); fs.renameSync(t, f); fs.chmodSync(f, 0o600);
}
const vide = () => ({ actif: false, ceo: null, collaborateurs: [], enAttente: [], fils: {}, notifies: {}, nouvelle: {} });
function lire() { try { return { ...vide(), ...JSON.parse(fs.readFileSync(F_ETAT(), 'utf8')) }; } catch { return vide(); } }
function ecrire(e) {
  const garder = (o, n) => Object.fromEntries(Object.entries(o || {}).slice(-n));
  ecrireAtomique(F_ETAT(), JSON.stringify({ ...e, fils: garder(e.fils, 500), notifies: garder(e.notifies, 1000) }, null, 1));
}
function modifier(fn) { const e = lire(); const r = fn(e); ecrire(e); return r; }

const lireJeton = (env, f) => process.env[env] ? process.env[env].trim() : (() => { try { return fs.readFileSync(f(), 'utf8').trim(); } catch { return ''; } })();
const jetonBot = () => lireJeton('SLACK_BOT_TOKEN', F_BOT), jetonApp = () => lireJeton('SLACK_APP_TOKEN', F_APP);
function enregistrerJetons({ bot, app }) {
  bot = String(bot || '').trim(); app = String(app || '').trim();
  if (!bot && !app) refus('Collez le jeton du bot (xoxb-…) et/ou le jeton de l\'app (xapp-…)');
  if (bot && !/^xoxb-[A-Za-z0-9-]{20,250}$/.test(bot)) refus('Jeton du bot attendu : xoxb-… (OAuth & Permissions)');
  if (app && !/^xapp-[A-Za-z0-9-]{20,250}$/.test(app)) refus('Jeton de l\'app attendu : xapp-… (Basic Information › App-Level Tokens, droit connections:write)');
  if (bot) ecrireAtomique(F_BOT(), bot);
  if (app) ecrireAtomique(F_APP(), app);
}

async function appel(methode, params = {}, { app = false } = {}) {
  const j = app ? jetonApp() : jetonBot(); if (!j) refus(app ? 'Jeton de l\'app Slack (xapp-…) absent' : 'Jeton du bot Slack (xoxb-…) absent');
  let r;
  try {
    r = await fetch(`${API()}/${methode}`, { method: 'POST', signal: AbortSignal.timeout(20e3),
      headers: { Authorization: 'Bearer ' + j, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(params) });
  } catch (e) { refus('Slack injoignable : ' + (e.cause && e.cause.code || e.message)); }
  const d = await r.json().catch(() => ({}));
  if (!d.ok) refus('Slack : ' + (d.error || r.status));
  return d;
}

// Message direct au destinataire (U…), texte brut, boutons facultatifs ; renvoie l'horodatage (ts) du message
async function envoyer(user, texte, boutons) {
  const t = String(texte || '').slice(0, 3000);
  const blocks = boutons ? [{ type: 'section', text: { type: 'plain_text', text: t, emoji: true } },
    { type: 'actions', elements: boutons.map(([text, value], i) => ({ type: 'button', action_id: 'siege_' + i, text: { type: 'plain_text', text }, value })) }] : undefined;
  const d = await appel('chat.postMessage', { channel: user, text: t, ...(blocks ? { blocks } : {}), unfurl_links: false, unfurl_media: false });
  return { ts: d.ts, channel: d.channel };
}
async function qui(user) {
  try { const u = (await appel('users.info', { user })).user || {}; return { id: user, nom: String((u.profile && u.profile.real_name) || u.real_name || u.name || user).slice(0, 80), username: u.name || '' }; }
  catch { return { id: user, nom: user, username: '' }; }
}

// Enveloppe Socket Mode → événement du Siège (fonction pure, testée) :
//   { type: 'message', de, texte, prive, reponseA, canal } | { type: 'bouton', de, data, canal } | null
function evenement(env) {
  const p = env && env.payload || {};
  if (env.type === 'events_api') {
    const e = p.event || {};
    if (e.type !== 'message' || e.subtype || e.bot_id || !ID.test(e.user || '')) return null;
    return { type: 'message', de: e.user, texte: String(e.text || ''), prive: e.channel_type === 'im', reponseA: e.thread_ts && e.thread_ts !== e.ts ? e.thread_ts : '', canal: e.channel };
  }
  if (env.type === 'interactive' && p.type === 'block_actions') {
    const a = (p.actions || [])[0] || {};
    return ID.test((p.user || {}).id || '') ? { type: 'bouton', de: p.user.id, data: String(a.value || ''), canal: (p.channel || {}).id || '' } : null;
  }
  return null;
}

// Connexion Socket Mode : chaque enveloppe est acquittée tout de suite (Slack la renverrait sinon), puis traitée
class Socket {
  constructor({ surEvenement, journal = () => {} }) { this.surEvenement = surEvenement; this.journal = journal; this.ws = null; this.arret = false; this.essais = 0; }
  async ouvrir() {
    if (!disponible()) refus('Slack demande Node 22 ou plus (WebSocket intégré)');
    const { url } = await appel('apps.connections.open', {}, { app: true });
    return new Promise((ok, ko) => {
      const ws = this.ws = new WebSocket(url);
      ws.onopen = () => { this.essais = 0; ok(); };
      ws.onerror = e => ko(new ErreurSlack('WebSocket : ' + (e.message || 'erreur')));
      ws.onmessage = m => {
        let env; try { env = JSON.parse(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString('utf8')); } catch { return; }
        if (env.envelope_id) ws.send(JSON.stringify({ envelope_id: env.envelope_id }));
        if (env.type === 'disconnect') { try { ws.close(); } catch {} return; }
        const ev = evenement(env); if (ev) Promise.resolve(this.surEvenement(ev)).catch(e => this.journal('événement ignoré : ' + e.message));
      };
      ws.onclose = () => { if (!this.arret) this.relancer(); };
    });
  }
  relancer() {
    const d = Math.min(60e3, 1e3 * 2 ** this.essais++);
    setTimeout(() => { if (lire().actif && !this.arret) this.ouvrir().catch(e => { this.journal('Slack : ' + e.message); this.relancer(); }); }, d);
  }
  fermer() { this.arret = true; try { this.ws && this.ws.close(); } catch {} }
}

module.exports = { lire, ecrire, modifier, jetonBot, jetonApp, enregistrerJetons, appel, envoyer, qui, evenement, Socket, MANIFESTE, ID, disponible, ErreurSlack };
