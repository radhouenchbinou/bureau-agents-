// Mode autonome, lot 5 : parallélisme. Le nombre d'instances simultanées suit ce que la machine supporte, avec une
// marge de sécurité, et il est recalculé avant chaque lancement. Une mémoire et un processeur libres sont comptés ; une
// machine déjà chargée réduit le nombre, jusqu'à zéro (rien ne se lance alors).
'use strict';
const os = require('os');

const MARGE = 0.25;               // on garde 25 % du processeur et de la mémoire libres
const MEMOIRE_PAR_INSTANCE = 1.5e9; // ordre de grandeur d'une instance de claude (1,5 Go)

// Nombre d'instances supplémentaires possibles maintenant (entier ≥ 0)
function capacite({ cpus = os.cpus().length, charge = os.loadavg()[0], memoireLibre = os.freemem(), parInstance = MEMOIRE_PAR_INSTANCE, marge = MARGE } = {}) {
  const cpuLibres = Math.floor(cpus * (1 - marge)) - Math.ceil(charge);
  const memLibres = Math.floor((memoireLibre * (1 - marge)) / parInstance);
  return Math.max(0, Math.min(cpuLibres, memLibres));
}

// Sérialise des appels asynchrones : une seule exécution à la fois
function verrou() {
  let file = Promise.resolve();
  return fn => {
    const r = file.then(fn);
    file = r.catch(() => {});
    return r;
  };
}

module.exports = { capacite, verrou, MARGE, MEMOIRE_PAR_INSTANCE };
