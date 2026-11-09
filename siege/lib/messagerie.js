// Messagerie Telegram du Siège (tourne dans le serveur quand l'option est active) :
//  - reçoit les messages (long polling) : collaborateur autorisé → demande DEM-… et session automatique du directeur ;
//    inconnu → demande d'accès au CEO, rien n'est traité ; CEO → réponses aux escalades ;
//  - boutons : le demandeur valide le résumé, le CEO accepte ou refuse ;
//  - prévient le CEO une fois par sujet : escalade, question d'agent en attente, exception à décider, demande d'accès.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const tg = require('./telegram'), dem = require('./demandes');

const PAR_HEURE = 20;            // messages acceptés par collaborateur et par heure
const SESSION_MAX_MS = 10 * 60e3;
const jour = () => new Date().toISOString().slice(0, 10);

const AIDE_COLLAB = 'Écrivez-moi simplement votre besoin : un bug (ce que vous faisiez, ce qui s\'est passé, ce que vous attendiez) ou une évolution. Je vous réponds ici.\n/mes : vos demandes · /nouvelle : commencer une autre demande';

class Messagerie {
  // lancer(id) → Promise : session du directeur sur une demande (par défaut : Claude Code en mode non interactif)
  constructor({ racine, lancer, journal = () => {}, extras = async () => [] }) {
    this.racine = racine; this.journal = journal; this.extras = extras; this.attente = []; this.enCours = null; this.recents = new Map();
    this.lancer = lancer || (id => lancerClaude(racine, id, journal));
  }

  // ---------- Réception ----------
  async traiter(u) {
    if (u.callback_query) return this.bouton(u.callback_query);
    const m = u.message; if (!m || !m.from || m.from.is_bot) return;
    if (!m.chat || m.chat.type !== 'private') return;      // conversations privées avec le bot seulement
    const e = tg.lire(), de = tg.qui(m.from), t = String(m.text || '').trim();
    const ceo = e.ceo && e.ceo.id === de.id, collab = e.collaborateurs.find(c => c.id === de.id);
    if (!ceo && !collab) return this.inconnu(de);
    if (!t) return tg.envoyer(de.id, 'Je ne lis que le texte pour l\'instant.');
    if (ceo) return this.duCeo(m, t);
    if (!this.rythme(de.id)) return tg.envoyer(de.id, 'Beaucoup de messages en peu de temps : je les traiterai un peu plus tard. Réessayez dans un moment.');
    if (t === '/start' || t === '/aide') return tg.envoyer(de.id, `Bonjour ${collab.nom}, je suis le directeur de programme.\n${AIDE_COLLAB}`);
    if (t === '/mes') {
      const l = dem.lire().liste.filter(x => x.auteur.id === de.id).slice(-10);
      return tg.envoyer(de.id, l.length ? l.map(x => `${x.id} · ${x.statut}${x.ticket ? ' · ' + x.ticket : ''} · ${(x.resume || x.messages[0].texte).slice(0, 60)}`).join('\n') : 'Aucune demande pour l\'instant.');
    }
    let nouvelle = false, texte = t;
    if (t.startsWith('/nouvelle')) { nouvelle = true; texte = t.slice(9).trim(); if (!texte) { tg.modifier(s => { (s.nouvelle = s.nouvelle || {})[de.id] = true; }); return tg.envoyer(de.id, 'D\'accord : votre prochain message ouvrira une nouvelle demande.'); } }
    if (texte.startsWith('/')) return tg.envoyer(de.id, AIDE_COLLAB);
    if (!nouvelle && (tg.lire().nouvelle || {})[de.id]) { nouvelle = true; tg.modifier(s => { delete s.nouvelle[de.id]; }); }
    const x = dem.recevoir({ id: de.id, nom: collab.nom }, texte, { nouvelle });
    await tg.envoyer(de.id, `${x.id} · Bien reçu, je regarde et je vous réponds ici.`);
    this.planifier(x.id);
  }
  async inconnu(de) {
    const nouveau = tg.modifier(s => { if (s.enAttente.some(a => a.id === de.id)) return false; s.enAttente.push({ ...de, date: new Date().toISOString() }); return true; });
    await tg.envoyer(de.id, 'Ce bot est réservé aux équipes de l\'entreprise. Votre demande d\'accès est transmise ; vous serez prévenu quand elle sera acceptée.');
    if (nouveau) await this.auCeo(`acces:${de.id}`, `Demande d'accès au bot : ${de.nom}${de.username ? ' (@' + de.username + ')' : ''}. À autoriser ou refuser dans Siège › Intégrations › Telegram.`);
  }
  async duCeo(m, t) {
    const e = tg.lire(), lie = m.reply_to_message && e.fils[m.reply_to_message.message_id];
    if (lie) { dem.ceo(lie, { texte: t }); await tg.envoyer(m.from.id, `${lie} · Consigne transmise au directeur.`); return this.planifier(lie); }
    if (t === '/demandes') {
      const l = dem.lire().liste.filter(dem.ouverte);
      return tg.envoyer(m.from.id, l.length ? l.map(x => `${x.id} · ${x.statut} · ${x.auteur.nom} · ${(x.resume || x.messages[0].texte).slice(0, 60)}`).join('\n') : 'Aucune demande ouverte.');
    }
    return tg.envoyer(m.from.id, 'Bonjour. Je vous écris ici quand une décision vous revient. Répondez à une de mes notifications pour qu\'elle aille à la bonne demande. /demandes : demandes ouvertes.');
  }
  async bouton(q) {
    const r = /^([vc]):(DEM-\d{3,5}):([01])$/.exec(q.data || ''), e = tg.lire();
    const repondre = text => tg.appel('answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});
    if (!r || !q.from) return repondre('Action inconnue');
    try {
      if (r[1] === 'v') { dem.validation(r[2], q.from.id, r[3] === '1'); await repondre(r[3] === '1' ? 'Merci, c\'est noté.' : 'D\'accord, précisez votre besoin en message.'); }
      else {
        if (!e.ceo || e.ceo.id !== q.from.id) return repondre('Réservé au CEO');
        dem.ceo(r[2], { decision: r[3] === '1' ? 'accepte' : 'refuse' }); await repondre(r[3] === '1' ? 'Accepté' : 'Refusé');
      }
      this.planifier(r[2]);
    } catch (err) { await repondre(String(err.message).slice(0, 180)); }
  }
  rythme(id) {
    const t = Date.now(), l = (this.recents.get(id) || []).filter(x => t - x < 36e5);
    if (l.length >= PAR_HEURE) return false;
    l.push(t); this.recents.set(id, l); return true;
  }

  // ---------- Sessions du directeur : une à la fois, plafond par jour ----------
  planifier(id) { if (!this.attente.includes(id)) this.attente.push(id); this.suivant(); }
  async suivant() {
    if (this.enCours || !this.attente.length) return;
    const e = tg.lire(), n = e.sessions[jour()] || 0;
    if (n >= (e.plafondJour || 50)) {
      return this.auCeo(`plafond:${jour()}`, `Plafond de ${e.plafondJour} sessions automatiques du directeur atteint aujourd'hui : ${this.attente.length} demande(s) en attente (${this.attente.join(', ')}). Relevez-le dans Siège › Intégrations › Telegram ou attendez demain.`);
    }
    const id = this.attente.shift();
    tg.modifier(s => { s.sessions[jour()] = (s.sessions[jour()] || 0) + 1; });
    this.enCours = id; this.journal(`directeur → ${id}`);
    try { await this.lancer(id); } catch (err) { this.journal(`session ${id} en échec : ${err.message}`); }
    finally { this.enCours = null; setImmediate(() => this.suivant()); }
  }

  // ---------- Notifications du CEO (une seule fois par sujet) ----------
  async auCeo(cle, texte) {
    const e = tg.lire(); if (!e.actif || !e.ceo || e.notifies[cle]) return false;
    await tg.envoyer(e.ceo.id, texte); tg.modifier(s => { s.notifies[cle] = new Date().toISOString(); }); return true;
  }
  async veille() { for (const [cle, texte] of await this.extras()) await this.auCeo(cle, texte).catch(err => this.journal('notification : ' + err.message)); }

  // ---------- Boucle ----------
  async tour() {
    const e = tg.lire(); if (!e.actif || !tg.jeton()) return false;
    const l = await tg.appel('getUpdates', { offset: e.offset || 0, timeout: 25, allowed_updates: ['message', 'callback_query'] }, { delaiMs: 35e3 });
    for (const u of l) {
      try { await this.traiter(u); } catch (err) { this.journal('message ignoré : ' + err.message); }
      tg.modifier(s => { s.offset = u.update_id + 1; });   // jamais deux fois le même message, même en cas d'erreur
    }
    return true;
  }
  demarrer() {
    if (this.boucle) return; this.boucle = true;
    const encore = async () => {
      let ok = false; try { ok = await this.tour(); } catch (err) { this.journal('Telegram : ' + err.message); }
      setTimeout(encore, ok ? 100 : 5e3);
    };
    encore(); setInterval(() => this.veille(), 60e3);
  }
}

// Session non interactive du directeur sur une demande, avec la garde et les droits habituels (settings.json du Siège)
function lancerClaude(racine, id, journal) {
  return new Promise((ok, ko) => {
    const f = path.join(process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege'), 'directeur-demandes.log');
    const out = fs.openSync(f, 'a');
    fs.writeSync(out, `\n=== ${new Date().toISOString()} /demande ${id}\n`);
    const p = spawn(process.env.CLAUDE_BIN || 'claude', ['-p', `/demande ${id}`, '--output-format', 'text',
      '--allowedTools', 'Bash(node siege/demande.js:*)', 'Bash(node siege/backlog.js:*)', 'Read', 'Grep', 'Glob'], { cwd: racine, stdio: ['ignore', out, out] });
    const t = setTimeout(() => { p.kill('SIGTERM'); journal(`session ${id} arrêtée après 10 min`); }, SESSION_MAX_MS);
    p.on('error', e => { clearTimeout(t); fs.closeSync(out); ko(e); });
    p.on('exit', c => { clearTimeout(t); fs.closeSync(out); c === 0 ? ok() : ko(new Error('code ' + c)); });
  });
}

module.exports = { Messagerie, lancerClaude, PAR_HEURE };
