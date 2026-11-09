// Telegram : canal des collaborateurs vers le directeur, et du directeur vers le CEO. Activable dans Siège › Intégrations.
// Bot créé par le CEO avec @BotFather ; jeton dans ~/.siege/telegram-token (600) ou TELEGRAM_TOKEN.
// État privé (personnes et identifiants Telegram) dans ~/.siege/telegram.json, jamais dans le dépôt :
//   { actif, ceo: {id, nom}, collaborateurs: [{id, nom, username, depuis}], enAttente: [{id, nom, username, date}],
//     offset, fils: { "<message_id>": "DEM-001" }, notifies: { "<clé>": date }, sessions: { "<AAAA-MM-JJ>": n }, plafondJour }
// API : https://api.telegram.org/bot<jeton>/<méthode> (long polling getUpdates : aucune adresse publique nécessaire).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const PRIVE = () => process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege');
const F_ETAT = () => path.join(PRIVE(), 'telegram.json'), F_JETON = () => path.join(PRIVE(), 'telegram-token');
const API = () => process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
const JETON_OK = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/;

class ErreurTelegram extends Error {}
const refus = m => { throw new ErreurTelegram(m); };

function ecrireAtomique(f, contenu) {
  fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
  const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, contenu, { mode: 0o600 }); fs.renameSync(t, f); fs.chmodSync(f, 0o600);
}
const vide = () => ({ actif: false, ceo: null, collaborateurs: [], enAttente: [], offset: 0, fils: {}, notifies: {}, sessions: {}, plafondJour: 50 });
function lire() { try { return { ...vide(), ...JSON.parse(fs.readFileSync(F_ETAT(), 'utf8')) }; } catch { return vide(); } }
function ecrire(e) {
  // Bornes : les tables de suivi ne grossissent pas indéfiniment
  const garder = (o, n) => Object.fromEntries(Object.entries(o || {}).slice(-n));
  ecrireAtomique(F_ETAT(), JSON.stringify({ ...e, fils: garder(e.fils, 500), notifies: garder(e.notifies, 1000), sessions: garder(e.sessions, 14) }, null, 1));
}
function modifier(fn) { const e = lire(); const r = fn(e); ecrire(e); return r; }

function jeton() {
  if (process.env.TELEGRAM_TOKEN) return process.env.TELEGRAM_TOKEN.trim();
  try { return fs.readFileSync(F_JETON(), 'utf8').trim(); } catch { return ''; }
}
function enregistrerJeton(v) {
  v = String(v || '').trim();
  if (!JETON_OK.test(v)) refus('Jeton de bot attendu (donné par @BotFather, de la forme 123456789:AA…)');
  ecrireAtomique(F_JETON(), v);
}

async function appel(methode, params = {}, { delaiMs = 20e3 } = {}) {
  const j = jeton(); if (!j) refus('Jeton du bot Telegram absent (Siège › Intégrations › Telegram)');
  let r;
  try {
    r = await fetch(`${API()}/bot${j}/${methode}`, { method: 'POST', signal: AbortSignal.timeout(delaiMs), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  } catch (e) { refus('Telegram injoignable : ' + (e.cause && e.cause.code || e.message)); }
  const d = await r.json().catch(() => ({}));
  if (!d.ok) refus('Telegram ' + r.status + ' : ' + (d.description || 'erreur'));
  return d.result;
}

// Texte brut seulement (pas de mise en forme interprétée) ; Telegram limite un message à 4 096 caractères
async function envoyer(chatId, texte, boutons) {
  const t = String(texte || '').slice(0, 4000);
  return appel('sendMessage', { chat_id: chatId, text: t, disable_web_page_preview: true,
    ...(boutons ? { reply_markup: { inline_keyboard: [boutons.map(([text, data]) => ({ text, callback_data: data }))] } } : {}) });
}

const qui = u => ({ id: u.id, nom: [u.first_name, u.last_name].filter(Boolean).join(' ').slice(0, 80) || ('@' + (u.username || u.id)), username: u.username || '' });

module.exports = { lire, ecrire, modifier, jeton, enregistrerJeton, appel, envoyer, qui, ErreurTelegram, F_ETAT };
