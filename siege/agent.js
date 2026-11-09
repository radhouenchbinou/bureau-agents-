#!/usr/bin/env node
// Agents d'un autre moteur que Claude Code (Codex aujourd'hui), lancés par le directeur pour une tâche précise d'un ticket.
// Les mêmes règles que pour les sous-agents Claude Code, tenues par cet outil puisque la garde ne voit pas l'intérieur
// d'un autre moteur :
//  - moteur et modèle activés par le CEO (droits/moteurs.json) ; rôle d'une filiale seulement ;
//  - bac à sable du moteur : écriture dans le repo de la filiale seulement, aucun réseau, aucune approbation demandée ;
//  - une tâche = une session neuve et éphémère ; consigne courte (rôle, fiche, mission, passation) ;
//  - ni jeton GitHub ni accès au backlog pour l'agent : la passation est inscrite sur le ticket par cet outil, et le
//    push (facultatif, --pousser) passe par node siege/github.js avec le jeton du rôle.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn, execFileSync } = require('child_process');
const moteurs = require('./lib/moteurs'), { filiales } = require('./lib/registre'), cfg = require('./lib/config');

const RACINE = process.env.SIEGE_RACINE || path.resolve(__dirname, '..');
const ROLES = ['product-owner', 'dev-backend', 'dev-frontend', 'qa', 'tech-writer'];   // rôles qui travaillent dans le repo d'une filiale
const DUREE_MAX_MS = 30 * 60e3;
const AIDE = `Agents d'un autre moteur — usage : node siege/agent.js <commande>

  moteurs                                   moteurs installés, modèles et ce que le CEO a activé
  lancer --moteur codex --modele <id> --role <rôle> --filiale "<Nom>" --ticket <ID> --etape "<n> · <nom>"
         --mission "<la tâche précise>" [--pousser feature/<ID>]
     Rôles : ${ROLES.join(', ')}. L'agent travaille dans le repo de la filiale, sans réseau ;
     sa passation est inscrite sur le ticket ; --pousser pousse ensuite la branche avec le jeton du rôle.
`;
class ErreurAgent extends Error {}
const refus = m => { throw new ErreurAgent(m); };
const opts = a => { const o = {}; for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) o[a[i].slice(2)] = a[i + 1] !== undefined && !a[i + 1].startsWith('--') ? a[++i] : ''; return o; };

function consigne({ role, filiale, ticket, etape, mission, moteur }) {
  const defRole = (() => { try { return fs.readFileSync(path.join(RACINE, '.claude', 'agents', role + '.md'), 'utf8').replace(/^---[\s\S]*?---\s*/, ''); } catch { return ''; } })();
  return `Tu es un agent de l'entreprise d'agents IA, rôle « ${role} », exécuté par ${moteur}. Tu travailles pour la filiale ${filiale.nom}, dans ce dossier (le repo de la filiale).

Mission
Ticket : ${ticket}
Étape : ${etape}
${mission}

Règles
- Lis d'abord la fiche de la filiale : CLAUDE.md à la racine de ce dossier. Respecte ses commandes, sa stack et ses règles métier.
- Tu n'écris que dans ce dossier et tu n'as pas de réseau. Ne modifie jamais CLAUDE.md, ni des fichiers de secrets (.env, *.pem).
- Ne pousse rien et n'ouvre pas de pull request : le Siège s'en charge après toi. Tu peux faire des commits locaux sur la branche de la mission.
- Fais exactement la mission, rien de plus ; si elle est impossible ou ambiguë, arrête-toi et dis pourquoi.
- Livrables dans des fichiers (spécification, code, tests, rapport) : ils font foi, pas ton message.
- Ton DERNIER message est ta passation, 10 lignes au plus : Fait · Livrables (chemins) · Décisions · Reste · Attention. Ne recopie pas le contenu des fichiers.

Ton rôle (référence)
${defRole.slice(0, 6000)}`;
}

async function lancer(o) {
  const nomMoteur = o.moteur || '', liste = await moteurs.detecter(), m = liste.find(x => x.nom === nomMoteur);
  if (!m || !moteurs.MOTEURS[nomMoteur].externe) refus('Moteur externe attendu : ' + liste.filter(x => x.externe).map(x => x.nom).join(', '));
  if (!m.installe) refus(`${m.libelle} n'est pas installé sur cette machine`);
  if (!m.actif) refus(`${m.libelle} est désactivé par le CEO (Siège › Agents › Moteurs)`);
  const mod = m.modeles.find(x => x.id === o.modele);
  if (!mod) refus(`Modèle inconnu pour ${m.libelle} : ${o.modele || '(aucun)'} — modèles activés : ${m.modeles.filter(x => x.actif).map(x => x.id).join(', ') || 'aucun'}`);
  if (!mod.actif) refus(`Modèle ${mod.id} désactivé par le CEO`);
  if (!ROLES.includes(o.role)) refus('--role : ' + ROLES.join(', '));
  const f = (await filiales(path.join(RACINE, 'portfolio', 'filiales.md'))).find(x => x.nom.toLowerCase() === String(o.filiale || '').toLowerCase());
  if (!f || f.repo === '—' || !f.repo) refus('--filiale : filiale du registre avec un repo');
  if (!/^([A-Z]{3}-\d{3}|BUG-\d{3})$/.test(o.ticket || '')) refus('--ticket <ID>');
  if (!/^\d+\b/.test(o.etape || '')) refus('--etape "<n> · <nom>"');
  const mission = String(o.mission || '').trim(); if (mission.length < 20) refus('--mission : la tâche précise, avec les chemins à lire');
  const dossier = path.join(RACINE, f.dossier);
  if (!fs.existsSync(path.join(dossier, 'CLAUDE.md'))) refus(`Fiche absente : ${f.dossier}/CLAUDE.md (lancer /nouvelle-filiale d'abord)`);

  const prive = process.env.SIEGE_PRIVE || path.join(os.homedir(), '.siege'); fs.mkdirSync(prive, { recursive: true, mode: 0o700 });
  const dernier = path.join(prive, `agent-${o.ticket}-${Date.now()}.txt`), journal = fs.openSync(path.join(prive, 'agents-externes.log'), 'a');
  fs.writeSync(journal, `\n=== ${new Date().toISOString()} ${nomMoteur}/${mod.id} ${o.role} ${o.ticket} étape ${o.etape}\n`);
  // Codex : session éphémère, bac à sable « workspace-write » sur le repo de la filiale, réseau coupé, config utilisateur ignorée
  const args = ['exec', '-m', mod.id, '-C', dossier, '-s', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=false',
    '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--color', 'never', '-o', dernier,
    consigne({ role: o.role, filiale: f, ticket: o.ticket, etape: o.etape, mission, moteur: `${m.libelle} (${mod.id})` })];
  const debut = Date.now();
  const code = await new Promise((ok, ko) => {
    const p = spawn(moteurs.MOTEURS[nomMoteur].bin(), args, { cwd: dossier, stdio: ['ignore', journal, journal] });
    const t = setTimeout(() => p.kill('SIGTERM'), DUREE_MAX_MS);
    p.on('error', e => { clearTimeout(t); ko(new ErreurAgent(`${m.libelle} n'a pas pu démarrer : ${e.message}`)); });
    p.on('exit', c => { clearTimeout(t); ok(c); });
  });
  fs.closeSync(journal);
  let passation = ''; try { passation = fs.readFileSync(dernier, 'utf8').trim(); fs.unlinkSync(dernier); } catch {}
  const duree = Math.round((Date.now() - debut) / 1000);
  if (code !== 0 && !passation) refus(`${m.libelle} s'est arrêté (code ${code}, ${duree} s) sans passation : voir ~/.siege/agents-externes.log`);

  // Passation inscrite sur le ticket au nom du rôle (l'agent externe n'a pas accès au backlog)
  const n = /^BUG-/.test(o.ticket) ? 'bugs' : 'features';
  await cfg.source(n).commenter(o.ticket, { auteur: o.role, texte: `Passation (${m.libelle} ${mod.id}, ${duree} s) · ${passation.replace(/\s+/g, ' ').slice(0, 1800) || '(aucun message)'}` });
  let pousse = '';
  if (o.pousser) {
    try { pousse = execFileSync(process.execPath, [path.join(__dirname, 'github.js'), 'pousser', '--role', o.role, '--filiale', f.nom, '--branche', o.pousser], { cwd: RACINE, encoding: 'utf8' }).trim(); }
    catch (e) { pousse = '⚠ push impossible : ' + String(e.stderr || e.message).trim().split('\n').pop(); }
  }
  return { moteur: m.libelle, modele: mod.id, duree, code, passation, pousse };
}

async function main(argv) {
  const [cmd, ...a] = argv, o = opts(a);
  if (!cmd || cmd === 'aide') return console.log(AIDE);
  if (cmd === 'moteurs') {
    for (const m of await moteurs.detecter({ forcer: 'actualiser' in o }))
      console.log(`${m.libelle.padEnd(12)} ${m.installe ? 'installé ' + m.version : 'absent'}${m.installe ? (m.actif ? ' · ACTIF' : ' · désactivé') : ''}${m.externe ? ' · via node siege/agent.js' : m.sousAgents ? ' · sous-agents du directeur' : ''}\n  modèles actifs : ${m.modeles.filter(x => x.actif).map(x => x.id).join(', ') || 'aucun'}`);
    return;
  }
  if (cmd === 'lancer') {
    const r = await lancer(o);
    console.log(`${r.moteur} (${r.modele}) a terminé en ${r.duree} s${r.code ? ' (code ' + r.code + ')' : ''}. Passation inscrite sur ${o.ticket} :\n${r.passation.split('\n').slice(0, 40).join('\n')}${r.pousse ? '\n' + r.pousse : ''}`);
    return;
  }
  refus('Commande inconnue : ' + cmd + '\n\n' + AIDE);
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e instanceof ErreurAgent || e instanceof moteurs.ErreurMoteur || e.name === 'ErreurBacklog' ? 'Erreur : ' + e.message : e); process.exit(1); });
module.exports = { main, lancer, consigne, ROLES };
