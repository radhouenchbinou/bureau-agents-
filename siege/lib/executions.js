// Exécutions persistantes (N1, périmètre P0) : une file d'exécutions d'agents tenue dans un fichier JSON, écrite
// atomiquement sous verrou. Règles :
//  - une exécution a une clé anti-doublon (ticket + étape + essai) : une même clé n'est jamais ajoutée deux fois ;
//  - une seule exécution « en_cours » par dépôt à la fois ;
//  - au plus 2 nouveaux essais après un échec ; au-delà, l'exécution est escaladée à un humain ;
//  - au redémarrage, une exécution « en_cours » est marquée « interrompue », jamais relancée automatiquement.
'use strict';
const fs = require('fs'), path = require('path');
const { ErreurSiege } = require('./options');

const ETATS = ['en_attente', 'en_cours', 'termine', 'echoue', 'interrompu', 'escalade'];
const NOUVEAUX_ESSAIS_MAX = 2;

class Executions {
  constructor(fichier) { this.fichier = fichier; }

  lire() {
    try { const j = JSON.parse(fs.readFileSync(this.fichier, 'utf8')); return Array.isArray(j.executions) ? j.executions : []; }
    catch (e) { if (e.code === 'ENOENT') return []; throw new ErreurSiege('Exécutions illisibles : ' + e.message); }
  }

  // Lecture-modification-écriture sous verrou (création exclusive du .lock), écriture atomique
  modifier(fn) {
    fs.mkdirSync(path.dirname(this.fichier), { recursive: true });
    const verrou = this.fichier + '.lock', fin = Date.now() + 10000;
    for (;;) {
      try { fs.writeFileSync(verrou, String(process.pid), { flag: 'wx' }); break; }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        if (Date.now() > fin) throw new ErreurSiege('Exécutions verrouillées par un autre processus');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      }
    }
    try {
      const els = this.lire(), res = fn(els), tmp = this.fichier + '.' + process.pid + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, executions: els }, null, 2) + '\n');
      fs.renameSync(tmp, this.fichier);
      return res;
    } finally { fs.unlinkSync(verrou); }
  }

  // Ajoute une exécution en attente ; refusée si la clé anti-doublon existe déjà
  demander({ ticket, etape, depot, agent }) {
    if (!ticket || !etape || !depot || !agent) throw new ErreurSiege('ticket, étape, dépôt et agent sont obligatoires');
    return this.modifier(els => {
      const cle = `${ticket}|${etape}|0`;
      if (els.some(e => e.cle === cle)) throw new ErreurSiege('Exécution déjà demandée pour ' + cle + ' (anti-doublon)');
      const e = { id: `EXE-${String(els.length + 1).padStart(4, '0')}`, cle, ticket, etape, depot, agent, essai: 0, etat: 'en_attente', creee: new Date().toISOString() };
      els.push(e); return e;
    });
  }

  // Passe en cours la prochaine exécution en attente, si son dépôt est libre
  demarrerSuivante() {
    return this.modifier(els => {
      const occupes = new Set(els.filter(e => e.etat === 'en_cours').map(e => e.depot));
      const e = els.find(x => x.etat === 'en_attente' && !occupes.has(x.depot));
      if (!e) return null;
      e.etat = 'en_cours'; e.debut = new Date().toISOString(); return e;
    });
  }

  terminer(id, { reussi, motif = '' }) {
    return this.modifier(els => {
      const e = els.find(x => x.id === id) || (() => { throw new ErreurSiege('Exécution introuvable : ' + id); })();
      if (e.etat !== 'en_cours') throw new ErreurSiege(`${id} n'est pas en cours (${e.etat})`);
      if (reussi) { e.etat = 'termine'; return e; }
      e.motif = motif;
      if (e.essai >= NOUVEAUX_ESSAIS_MAX) { e.etat = 'escalade'; return e; }
      // Nouvel essai : même ticket et étape, clé d'essai distincte
      e.etat = 'echoue';
      const essai = e.essai + 1, cle = `${e.ticket}|${e.etape}|${essai}`;
      if (els.some(x => x.cle === cle)) throw new ErreurSiege('Nouvel essai déjà existant : ' + cle);
      els.push({ id: `EXE-${String(els.length + 1).padStart(4, '0')}`, cle, ticket: e.ticket, etape: e.etape, depot: e.depot, agent: e.agent, essai, etat: 'en_attente', creee: new Date().toISOString(), essai_de: e.id });
      return e;
    });
  }

  // Au démarrage du Siège : rien n'est relancé ; les exécutions restées « en_cours » sont marquées interrompues
  reprendre() {
    return this.modifier(els => {
      const interrompues = els.filter(e => e.etat === 'en_cours');
      for (const e of interrompues) { e.etat = 'interrompu'; e.motif = 'Siège redémarré pendant l\'exécution'; }
      return interrompues.map(e => e.id);
    });
  }
}

module.exports = { Executions, ETATS, NOUVEAUX_ESSAIS_MAX };
