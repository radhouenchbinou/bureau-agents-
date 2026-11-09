// Journal de la garde : ~/.siege/journal-garde.jsonl (lu par le Siège). Une ligne JSON par événement.
// Ne lève jamais : une erreur d'écriture ne doit ni bloquer ni, surtout, laisser passer une action.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const dossier = () => process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege');
function journal(ligne) {
  try {
    const d = dossier(); fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    fs.appendFileSync(path.join(d, 'journal-garde.jsonl'), JSON.stringify({ date: new Date().toISOString(), ...ligne }) + '\n', { mode: 0o600 });
  } catch {}
}
const court = (v, n = 200) => String(v == null ? '' : v).slice(0, n);
// Refus d'identité (R8) : rôle réel, valeur demandée, outil, sous-commande ; jamais le texte d'un commentaire ni un jeton
function refusIdentite({ role, demande, outil, sous_commande }) {
  journal({ evenement: 'refus_identite', role: court(role, 60), demande: court(demande), outil: court(outil, 30), sous_commande: court(sous_commande, 30) });
}

module.exports = { journal, refusIdentite };
