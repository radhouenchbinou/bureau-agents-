// Mode autonome, lot 4 : fusion automatique dans main quand la criticité est sous le seuil (90 %) et que les feux
// agents/revue et agents/securite sont verts. Le CEO a choisi cette dérogation (2026-11-10). Une criticité fixe à
// 100 % (fichier critique) ne fusionne jamais, même si les feux sont verts.
'use strict';
const crit = require('./criticite');

// Décision pure : { ok, motif }
function peutFusionner({ criticite, feux }) {
  if (!criticite) return { ok: false, motif: 'criticité inconnue' };
  if (criticite.fixe) return { ok: false, motif: 'criticité fixe : ' + criticite.motif };
  if (crit.enAttente(criticite.taux)) return { ok: false, motif: `criticité ${criticite.taux} % au-dessus du seuil` };
  if (!feux) return { ok: false, motif: 'feux non lus' };
  if (feux.revue !== 'success') return { ok: false, motif: 'feu agents/revue non vert (' + (feux.revue || 'absent') + ')' };
  if (feux.securite !== 'success') return { ok: false, motif: 'feu agents/securite non vert (' + (feux.securite || 'absent') + ')' };
  return { ok: true, motif: `criticité ${criticite.taux} %, feux verts` };
}

// Fusionne si la décision est positive ; sinon renvoie le motif sans rien faire
async function fusionnerSiPret({ criticite, feux, fusionner }) {
  const d = peutFusionner({ criticite, feux });
  if (!d.ok) return { fusionne: false, motif: d.motif };
  await fusionner();
  return { fusionne: true, motif: d.motif };
}

module.exports = { peutFusionner, fusionnerSiPret };
