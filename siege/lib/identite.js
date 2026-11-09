// Identité imposée (EIA-001, C2) : l'auteur d'une action est fixé par la garde, jamais par un argument.
//  - La garde, quand elle autorise un segment « node siege/<outil>.js … », dépose dans ~/.siege/identites/ une entrée
//    { role, expire } à usage unique, nommée par l'empreinte des mots du segment (cleIdentite).
//  - L'outil recalcule l'empreinte depuis son argv, consomme l'entrée et en tire le rôle. Entrée absente, expirée ou
//    illisible → refus « identité inconnue » (échec fermé). Sans marqueur de contexte d'agent : humain, comportement actuel.
// Hors périmètre : un processus qui écrirait lui-même dans le registre (isolation par conteneur, N2).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { ErreurSiege } = require('./options');
const journal = require('./journal');

const DUREE_MS = 120e3;
const MARQUEURS = ['SIEGE_CONTEXTE', 'CLAUDECODE', 'SIEGE_ROLE'];     // l'un d'eux suffit : appel d'agent
const OUTILS = ['backlog', 'github', 'exception', 'agent', 'demande', 'filiale'];
const RACINE = () => process.env.SIEGE_RACINE || path.resolve(__dirname, '..', '..');
class ErreurIdentite extends ErreurSiege {}

const normaliser = s => String(s == null ? '' : s).trim().toLowerCase();
const prive = env => (env || process.env).SIEGE_PRIVE || path.join(os.homedir(), '.siege');
const dossier = env => path.join(prive(env), 'identites');
// Une seule fonction pour la garde et l'outil : mots = ['siege/<outil>.js', ...arguments]
const cleIdentite = mots => crypto.createHash('sha256').update(JSON.stringify(mots.map(String))).digest('hex');
const contexteAgent = (env = process.env) => MARQUEURS.some(k => env[k] !== undefined);

function politique(racine) {
  try { const p = JSON.parse(fs.readFileSync(path.join(racine || RACINE(), 'droits', 'roles.json'), 'utf8')); if (p && p.roles && typeof p.roles === 'object') return p; } catch {}
  throw new ErreurIdentite('identité inconnue');
}
// Noms réservés aux humains : commun.identites_humaines de roles.json ; « CEO » l'est toujours
function humaines(p) {
  const l = p && p.commun && Array.isArray(p.commun.identites_humaines) ? p.commun.identites_humaines.filter(x => typeof x === 'string' && x.trim()) : [];
  return [...new Set(['CEO', ...l])];
}
const aRole = (p, role) => typeof role === 'string' && Object.prototype.hasOwnProperty.call(p.roles, role);
// Un rôle d'agent ne peut pas porter le nom d'un humain (erreur de configuration, échec fermé)
function rolesReserves(p) { const h = humaines(p).map(normaliser); return Object.keys(p.roles).filter(r => h.includes(normaliser(r))); }

// Message de refus si l'agent `role` demande l'identité `valeur` (--auteur, --role), sinon null. Égalité stricte après
// normalisation (casse, espaces) : pas de startsWith, pas de normalisation Unicode partielle.
function refusDemande(p, role, valeur) {
  if (valeur === undefined) return null;
  const n = normaliser(valeur), h = humaines(p).find(x => normaliser(x) === n);
  if (h) return 'auteur réservé aux humains : ' + h;
  if (n !== normaliser(role)) return `identité imposée par la garde : ${role} (valeur refusée : ${String(valeur).slice(0, 40)})`;
  return null;
}

// ---------- Côté garde : dépôt de l'entrée ----------
function purger(d, maintenant) {
  let l = []; try { l = fs.readdirSync(d); } catch { return; }
  for (const n of l) {
    const f = path.join(d, n);
    try {
      let perime;
      if (n.endsWith('.json')) { try { const e = JSON.parse(fs.readFileSync(f, 'utf8')); perime = !(Number.isInteger(e.expire) && e.expire >= maintenant); } catch { perime = maintenant - fs.statSync(f).mtimeMs > DUREE_MS; } }
      else perime = maintenant - fs.statSync(f).mtimeMs > DUREE_MS;     // restes (.pris, fichiers étrangers) anciens
      if (perime) fs.unlinkSync(f);
    } catch {}
  }
}
// Renvoie null (déposée ou déjà là pour ce rôle) ou un message de refus. Erreur d'écriture → refus.
function deposer(role, mots, { env, maintenant = Date.now() } = {}) {
  try {
    const d = dossier(env); fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    purger(d, maintenant);
    const f = path.join(d, cleIdentite(mots) + '.json');
    // Le fichier final n'apparaît jamais à moitié écrit : écriture dans un temporaire, puis linkSync (création atomique, EEXIST si présent)
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ role, expire: maintenant + DUREE_MS }), { flag: 'wx', mode: 0o600 });
    try {
      for (let essai = 0; essai < 2; essai++) {
        try { fs.linkSync(tmp, f); return null; }
        catch (e) {
          if (e.code !== 'EEXIST') throw e;
          let x = null; try { x = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
          if (x && Number.isInteger(x.expire)) {
            if (x.expire >= maintenant) return x.role === role ? null : 'commande identique en cours pour un autre rôle, réessaie';
          } else if (maintenant - fs.statSync(f).mtimeMs <= DUREE_MS) return 'entrée illisible en cours pour cette commande, réessaie';   // jamais remplacée tant qu'elle est récente
          try { fs.unlinkSync(f); } catch {}
        }
      }
    } finally { try { fs.unlinkSync(tmp); } catch {} }
    throw new Error('registre');
  } catch { return 'identité : dépôt impossible dans ' + path.join('~', '.siege', 'identites'); }
}

// ---------- Côté outil : lecture de l'identité ----------
// { humain: true } hors contexte d'agent ; { humain: false, role } sinon ; ErreurIdentite si l'entrée manque (échec fermé)
function resoudre({ outil, args, env = process.env, racine, maintenant = Date.now() }) {
  if (!contexteAgent(env)) return { humain: true };
  const refus = (message, role = '') => { journal.refusIdentite({ role, demande: '', outil, sous_commande: String(args[0] || '') }); throw new ErreurIdentite(message); };
  let p, e;
  try { p = politique(racine); } catch { return refus('identité inconnue'); }
  const f = path.join(dossier(env), cleIdentite(['siege/' + outil + '.js', ...args]) + '.json'), pris = f + '.' + process.pid + '.pris';
  try { fs.renameSync(f, pris); } catch { return refus('identité inconnue'); }      // consommation atomique : la première gagne
  try { e = JSON.parse(fs.readFileSync(pris, 'utf8')); } catch { e = null; }
  try { fs.unlinkSync(pris); } catch {}
  if (!e || !Number.isInteger(e.expire) || maintenant > e.expire || e.expire > maintenant + DUREE_MS + 1000 || !aRole(p, e.role)) return refus('identité inconnue');
  if (rolesReserves(p).includes(e.role)) return refus('configuration : un rôle d\'agent porte un nom réservé aux humains', e.role);
  return { humain: false, role: e.role, politique: p };
}
// Valeur d'--auteur / --role à retenir. Humain : telle quelle. Agent : le rôle imposé, ou refus si autre chose est demandé.
function imposer(acteur, valeur, { outil, sous_commande }) {
  if (acteur.humain) return valeur;
  const m = refusDemande(acteur.politique, acteur.role, valeur);
  if (m) { journal.refusIdentite({ role: acteur.role, demande: valeur, outil, sous_commande }); throw new ErreurIdentite(m); }
  return acteur.role;
}

module.exports = { resoudre, imposer, deposer, cleIdentite, contexteAgent, normaliser, humaines, rolesReserves, refusDemande, politique, ErreurIdentite, MARQUEURS, OUTILS, DUREE_MS, dossier };
