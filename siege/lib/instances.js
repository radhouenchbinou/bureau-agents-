// Registre des instances d'agents (mode autonome) : une entrée par instance lancée, avec son moteur, son modèle, son
// rôle, son ticket, son worktree et son état. Lu par le Bureau. Écrit d'un bloc (fichier temporaire puis renommage).
'use strict';
const fs = require('fs'), path = require('path');

const ETATS = ['en cours', 'terminée', 'échouée', 'interrompue'];

class Registre {
  constructor(fichier) { this.fichier = fichier; }

  lire() {
    try { const j = JSON.parse(fs.readFileSync(this.fichier, 'utf8')); return Array.isArray(j.instances) ? j.instances : []; }
    catch (e) { if (e.code === 'ENOENT') return []; return []; }
  }

  ecrire(liste) {
    fs.mkdirSync(path.dirname(this.fichier), { recursive: true });
    const tmp = this.fichier + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, instances: liste.slice(-500) }, null, 2) + '\n');
    fs.renameSync(tmp, this.fichier);
  }

  // Ajoute une instance « en cours » ; renvoie son identifiant
  ouvrir({ role, ticket, moteur = 'claude', modele = '', dossier = '' }) {
    const id = `${ticket || 'x'}-${role || 'agent'}-${Date.now().toString(36)}`;
    const liste = this.lire();
    liste.push({ id, role: role || '', ticket: ticket || '', moteur, modele, dossier, etat: 'en cours', debut: new Date().toISOString(), fin: '' });
    this.ecrire(liste);
    return id;
  }

  clore(id, { ok, motif = '' } = {}) {
    const liste = this.lire(), e = liste.find(x => x.id === id);
    if (!e) return false;
    e.etat = ok ? 'terminée' : 'échouée';
    e.fin = new Date().toISOString();
    if (motif) e.motif = String(motif).slice(0, 200);
    this.ecrire(liste);
    return true;
  }

  // Au démarrage : une instance restée « en cours » après un arrêt est marquée interrompue
  reprendre() {
    const liste = this.lire();
    let n = 0;
    for (const e of liste) if (e.etat === 'en cours') { e.etat = 'interrompue'; e.fin = new Date().toISOString(); n++; }
    if (n) this.ecrire(liste);
    return n;
  }
}

// Vue pour le Bureau : groupes par moteur et modèle
function grouper(liste) {
  const g = {};
  for (const e of liste) {
    const cle = `${e.moteur || 'claude'} · ${e.modele || 'modèle par défaut'}`;
    (g[cle] = g[cle] || []).push(e);
  }
  return Object.entries(g).map(([modele, instances]) => ({ modele, instances: instances.slice().reverse() }));
}

module.exports = { Registre, grouper, ETATS };
