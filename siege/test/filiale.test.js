'use strict';
// /nouvelle-filiale : l'outil crée fiche, docs/ et ligne du registre ; jamais d'écrasement, jamais hors de projets/.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');

test('filiale.js : ajout validé, doublons et chemins refusés, fiche existante jamais écrasée', async () => {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-f-'));
  fs.mkdirSync(path.join(T, 'portfolio')); fs.mkdirSync(path.join(T, 'projets', 'api', 'module'), { recursive: true }); fs.mkdirSync(path.join(T, 'projets', 'front'));
  fs.writeFileSync(path.join(T, 'portfolio', 'filiales.md'), '# Registre\n\n| Filiale | Préfixe | Dossier | Repo git | Statut |\n|---|---|---|---|---|\n| Groupe | GRP | `portfolio` | — | Transverse |\n\nNote.\n');
  process.env.SIEGE_RACINE = T; delete require.cache[require.resolve('../filiale')];
  const { ajouter } = require('../filiale'), fiche = '# Fiche filiale — API\n\n## Identité\n- Nom : API — Préfixe : API\n- Mission : exposer les réservations aux deux applications.';
  await ajouter({ nom: 'API', prefixe: 'API', dossier: 'projets/api', fiche });
  assert.match(fs.readFileSync(path.join(T, 'portfolio', 'filiales.md'), 'utf8'), /\| Groupe .*\n\| API \| API \| `projets\/api` \| `projets\/api` \| Active \|\n\nNote\./);
  assert.ok(fs.existsSync(path.join(T, 'projets', 'api', 'docs', 'rapports')));
  await assert.rejects(ajouter({ nom: 'Front', prefixe: 'API', dossier: 'projets/front', fiche }), /Préfixe déjà utilisé/);
  await assert.rejects(ajouter({ nom: 'Front', prefixe: 'FRT', dossier: '../front', fiche }), /sous projets/);
  await assert.rejects(ajouter({ nom: 'Front', prefixe: 'FRT', dossier: 'projets/absent', fiche }), /introuvable/);
  await assert.rejects(ajouter({ nom: 'Front', prefixe: 'FRT', dossier: 'projets/front', repo: 'projets/api', fiche }), /dans --repo/);
  await assert.rejects(ajouter({ nom: 'Front', prefixe: 'BUG', dossier: 'projets/front', fiche }), /réservés/);
  fs.writeFileSync(path.join(T, 'projets', 'front', 'CLAUDE.md'), 'fiche du CEO');
  await assert.rejects(ajouter({ nom: 'Front', prefixe: 'FRT', dossier: 'projets/front', fiche }), /jamais écrasé/);
  assert.strictEqual(fs.readFileSync(path.join(T, 'projets', 'front', 'CLAUDE.md'), 'utf8'), 'fiche du CEO');
});
