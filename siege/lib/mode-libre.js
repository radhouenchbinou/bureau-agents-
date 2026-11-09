// Mode sans restriction : décidé par le CEO dans Siège › Admin, il lève toutes les restrictions des agents (garde,
// bac à sable, interdictions de Claude Code) pendant une durée choisie ou jusqu'à ce qu'il le désactive.
// La garde laisse alors tout passer mais journalise chaque action (~/.siege/journal-garde.jsonl).
// État dans droits/mode-libre.json (droits/ est hors de portée des agents tant que le mode est inactif).
'use strict';
const fs = require('fs'), path = require('path');

const F = racine => path.join(racine, 'droits', 'mode-libre.json');
const DUREES_H = [1, 4, 8, 24, 0];   // 0 = jusqu'à désactivation par le CEO

function brut(racine) { try { return JSON.parse(fs.readFileSync(F(racine), 'utf8')); } catch { return { actif: false }; } }
// État effectif : un mode expiré compte comme inactif
function lire(racine, maintenant = Date.now()) {
  const e = brut(racine);
  const expire = !!(e.actif && e.jusqua && Date.parse(e.jusqua) <= maintenant);
  return { actif: !!e.actif && !expire, jusqua: e.jusqua || null, active_le: e.active_le || null, desactive_le: e.desactive_le || null, expire };
}
const actif = racine => lire(racine).actif;
function ecrire(racine, e) { const f = F(racine), t = f + '.' + process.pid + '.tmp'; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(t, JSON.stringify(e, null, 2) + '\n'); fs.renameSync(t, f); }

function activer(racine, dureeH) {
  const h = Number(dureeH); if (!DUREES_H.includes(h)) throw new Error('Durée attendue : ' + DUREES_H.map(x => x || 'illimitée').join(', '));
  const e = { actif: true, active_le: new Date().toISOString(), jusqua: h ? new Date(Date.now() + h * 3600e3).toISOString() : null };
  ecrire(racine, e); return lire(racine);
}
function desactiver(racine) { ecrire(racine, { ...brut(racine), actif: false, desactive_le: new Date().toISOString() }); return lire(racine); }

module.exports = { lire, actif, activer, desactiver, DUREES_H };
