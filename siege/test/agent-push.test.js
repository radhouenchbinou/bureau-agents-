'use strict';
require('./_humain');
// EIA-001 (Q4) : le push d'un agent Codex passe en processus par pousserBranche, avec le jeton du rôle lancé ; la passation
// porte auteur = rôle lancé ; aucun sous-processus github.js (il serait refusé faute d'entrée d'identité).
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const REEL = path.resolve(__dirname, '..', '..');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-push-'));
process.env.SIEGE_RACINE = T; process.env.SIEGE_PRIVE = path.join(T, 'prive');
for (const d of ['droits', 'portfolio', 'projets/api', 'bin']) fs.mkdirSync(path.join(T, d), { recursive: true });
fs.copyFileSync(path.join(REEL, 'droits', 'roles.json'), path.join(T, 'droits', 'roles.json'));
fs.writeFileSync(path.join(T, 'portfolio', 'filiales.md'), '| Filiale | Préfixe | Dossier | Repo git | Statut |\n|---|---|---|---|---|\n| API | API | `projets/api` | `projets/api` | Active |\n');
fs.writeFileSync(path.join(T, 'portfolio', 'features.json'), JSON.stringify({ elements: [{ id: 'API-001', titre: 'Santé', rang: 1, filiale: 'API', statut: 'En cours', dependances: [] }] }));
fs.writeFileSync(path.join(T, 'portfolio', 'source-backlog.json'), '{"type":"fichier"}');
fs.writeFileSync(path.join(T, 'projets', 'api', 'CLAUDE.md'), '# Fiche filiale — API\n');
const codex = path.join(T, 'bin', 'codex'); process.env.CODEX_BIN = codex; process.env.GEMINI_BIN = path.join(T, 'bin', 'absent');
fs.writeFileSync(codex, `#!/usr/bin/env node
const a = process.argv.slice(2), fs = require('fs');
if (a[0] === '--version') { console.log('codex-cli 9.9.9'); process.exit(0); }
if (a[0] === 'debug') { console.log(JSON.stringify({ models: [{ slug: 'gpt-a', display_name: 'A', visibility: 'list', priority: 1 }] })); process.exit(0); }
if (a[0] === 'exec') { fs.writeFileSync(a[a.indexOf('-o') + 1], 'Fait : ok'); process.exit(0); }
process.exit(2);
`, { mode: 0o755 });

const gh = require('../lib/github'), moteurs = require('../lib/moteurs'), agent = require('../agent');
moteurs.activerMoteur('codex', true);
const mission = branche => ({ moteur: 'codex', modele: 'gpt-a', role: 'dev-backend', filiale: 'API', ticket: 'API-001', etape: '4 · Développement', mission: 'Ajouter un endpoint GET /sante et ses tests.', ...(branche ? { pousser: branche } : {}) });

test('push Codex : en processus, jeton du rôle lancé, passation au nom du rôle, main refusé', async () => {
  const sauve = { config: gh.config, jetonRole: gh.jetonRole, pousser: gh.pousser }, appels = { jeton: [], push: [] };
  gh.config = () => ({ repos: { 'projets/api': 'moi/api' } });
  gh.jetonRole = async (c, politique, role, repo) => { appels.jeton.push([role, repo]); return 'ghs_x'; };
  // la vraie vérification de branche refuse main avant tout git ; une branche valide n'exécute rien
  gh.pousser = (dossier, repo, branche, jeton) => { appels.push.push([dossier, repo, branche, jeton]); if (!/^(feature|fix)\//.test(branche)) sauve.pousser(dossier, repo, branche, jeton); };
  try {
    const r = await agent.lancer(mission('feature/API-001'));
    assert.deepStrictEqual(appels.jeton, [['dev-backend', 'moi/api']], 'jeton demandé pour le rôle lancé');
    assert.deepStrictEqual(appels.push, [[path.join(T, 'projets/api'), 'moi/api', 'feature/API-001', 'ghs_x']]);
    assert.match(r.pousse, /Branche feature\/API-001 poussée sur moi\/api/);
    const c = JSON.parse(fs.readFileSync(path.join(T, 'portfolio', 'commentaires.json'), 'utf8'))['API-001'];
    assert.strictEqual(c.at(-1).auteur, 'dev-backend');
    const r2 = await agent.lancer(mission('main'));
    assert.match(r2.pousse, /push impossible.*jamais main/);
    assert.strictEqual(appels.push.length, 2, 'main atteint gh.pousser, qui le refuse ; l\'échec est rendu sans lever');
  } finally { Object.assign(gh, sauve); }
});
