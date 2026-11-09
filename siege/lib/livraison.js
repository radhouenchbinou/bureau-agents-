// Livraison groupée d'une feature qui touche plusieurs filiales (un repo par filiale) :
// un ticket parent, un ticket enfant par filiale avec sa PR ; tout est vérifié avant de fusionner quoi que ce soit.
'use strict';
const { ErreurBacklog } = require('./backlog');

const PR = /^([A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100})#(\d{1,7})$/;
const lirePr = s => { const m = PR.exec(s || ''); return m ? { repo: m[1], numero: Number(m[2]) } : null; };

// Tickets du lot dans l'ordre de fusion : un enfant passe après ceux dont il dépend (le producteur avant ses
// consommateurs), puis par rang. Le parent est inclus s'il a lui-même une PR.
function lot(features, parentId) {
  const parent = features.find(f => f.id === parentId);
  if (!parent) throw new ErreurBacklog('Ticket parent introuvable : ' + parentId);
  if (parent.parent) throw new ErreurBacklog(`${parentId} est lui-même l'enfant de ${parent.parent} : livrer depuis le parent`);
  const membres = [...(parent.pr ? [parent] : []), ...features.filter(f => f.parent === parentId)];
  if (membres.length < 2) throw new ErreurBacklog(`${parentId} n'a pas de lot (au moins deux tickets avec une PR, enfants « --parent ${parentId} »)`);
  const ids = new Set(membres.map(m => m.id)), faits = new Set(), ordre = [];
  const rang = (a, b) => (a.rang || 1e9) - (b.rang || 1e9) || a.id.localeCompare(b.id);
  while (ordre.length < membres.length) {
    const prets = membres.filter(m => !faits.has(m.id) && (m.dependances || []).every(d => !ids.has(d) || faits.has(d))).sort(rang);
    if (!prets.length) throw new ErreurBacklog('Dépendances circulaires dans le lot ' + parentId);
    ordre.push(prets[0]); faits.add(prets[0].id);
  }
  const manque = ordre.filter(m => !lirePr(m.pr)).map(m => `${m.id} (${m.filiale}) sans PR`);
  return { parent, membres: ordre.map(m => ({ ...m, ref: lirePr(m.pr) })), manque };
}

// verifier(m) → { manque: [] } ; fusionner(m) → void. Rien n'est fusionné tant qu'un seul ticket n'est pas prêt.
// Si une fusion échoue en cours de route (conflit apparu, main déplacée), on s'arrête et on dit exactement où.
async function livrer(l, { verifier, fusionner }) {
  if (l.manque.length) return { ok: false, phase: 'verification', manques: l.manque, fusionnees: [] };
  const manques = [];
  for (const m of l.membres) { const v = await verifier(m); for (const x of v.manque) manques.push(`${m.id} ${m.ref.repo}#${m.ref.numero} : ${x}`); }
  if (manques.length) return { ok: false, phase: 'verification', manques, fusionnees: [] };
  const fusionnees = [];
  for (const m of l.membres) {
    try { await fusionner(m); fusionnees.push(m.id); }
    catch (e) { return { ok: false, phase: 'fusion', echec: { id: m.id, erreur: e.message }, fusionnees, restantes: l.membres.slice(fusionnees.length + 1).map(x => x.id) }; }
  }
  return { ok: true, fusionnees };
}

module.exports = { lot, livrer, lirePr };
