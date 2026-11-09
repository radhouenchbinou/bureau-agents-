// Registre des filiales : tableau de `portfolio/filiales.md` (Filiale | Préfixe | Dossier | Repo git | Statut).
'use strict';
const fsp = require('fs').promises;

const sansCode = s => s.replace(/`/g, '').trim();

async function filiales(fichier) {
  let txt = ''; try { txt = await fsp.readFile(fichier, 'utf8'); } catch { return []; }
  const out = [];
  for (const l of txt.split(/\r?\n/)) {
    const c = l.split('|').slice(1, -1).map(sansCode);
    if (c.length < 3 || !/^[A-Z]{3}$/.test(c[1] || '')) continue;
    out.push({ nom: c[0], prefixe: c[1], dossier: c[2], repo: c[3] || '', statut: c[4] || '' });
  }
  return out;
}

module.exports = { filiales };
