'use strict';
// Clonage d'un dépôt depuis le Siège : adresse contrôlée, destination dans projets/, pas d'écrasement, nettoyage
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const { cloner, valider } = require('../lib/clonage');

test('adresse : https, hôte de l\'entreprise, sans identifiant, chemin propriétaire/dépôt', () => {
  assert.strictEqual(valider({ url: 'https://github.com/acme/app.git', nom: 'app' }), 'https://github.com/acme/app');
  assert.throws(() => valider({ url: 'http://github.com/acme/app', nom: 'app' }), /https/);
  assert.throws(() => valider({ url: 'https://u:p@github.com/acme/app', nom: 'app' }), /identifiant/);
  assert.throws(() => valider({ url: 'https://evil.example/acme/app', nom: 'app' }), /seul l'hôte/);
  assert.throws(() => valider({ url: 'https://github.com/acme', nom: 'app' }), /propriétaire\/dépôt/);
  assert.throws(() => valider({ url: 'https://github.com/acme/app', nom: '../x' }), /nom de dossier/);
  assert.throws(() => valider({ url: 'pas une adresse', nom: 'app' }), /invalide/);
});

test('clonage : dans projets/<nom>, refuse l\'écrasement, nettoie en cas d\'échec', () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'siege-clone-'));
  const ok = cloner({ racine, url: 'https://github.com/acme/app', nom: 'app', execFn: (c, a) => fs.mkdirSync(a[3], { recursive: true }) });
  assert.strictEqual(ok.dossier, path.join(racine, 'projets', 'app'));
  assert.throws(() => cloner({ racine, url: 'https://github.com/acme/app', nom: 'app', execFn: () => {} }), /déjà présent/);
  const echec = () => { const e = new Error('x'); e.stderr = 'Repository not found'; throw e; };
  assert.throws(() => cloner({ racine, url: 'https://github.com/acme/prive', nom: 'prive', execFn: (c, a) => { fs.mkdirSync(a[3], { recursive: true }); echec(); } }), /privé ou inaccessible/);
  assert.ok(!fs.existsSync(path.join(racine, 'projets', 'prive')), 'dossier partiel supprimé');
});
