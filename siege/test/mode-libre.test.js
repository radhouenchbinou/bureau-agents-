// Mode sans restriction (Siège › Admin) : tout passe pendant la durée choisie, puis la garde et le bac à sable reviennent.
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const R = fs.mkdtempSync(path.join(os.tmpdir(), 'libre-'));
fs.mkdirSync(path.join(R, 'droits')); fs.copyFileSync(path.join(__dirname, '..', '..', 'droits', 'roles.json'), path.join(R, 'droits', 'roles.json'));
const garde = require('../lib/garde'), libre = require('../lib/mode-libre'), pa = require('../lib/parametres');
const d = (role, outil, entree) => garde.decider(garde.charger(R), { outil, entree }, { racine: R, role });

test('inactif par défaut : la garde refuse comme d\'habitude, bac à sable présent', () => {
  assert.ok(!libre.actif(R));
  assert.ok(!d('dev-backend', 'Bash', { command: 'curl https://exemple.com' }).ok);
  assert.ok(!d('qa', 'Write', { file_path: path.join(R, 'droits/roles.json') }).ok);
  assert.strictEqual(pa.settings(R).sandbox.enabled, true);
});

test('actif : tout passe, sans bac à sable ni interdictions ; désactivé : tout revient', () => {
  assert.throws(() => libre.activer(R, 3), /Durée/);
  const e = libre.activer(R, 1);
  assert.ok(e.actif && e.jusqua);
  for (const [role, outil, entree] of [['dev-backend', 'Bash', { command: 'curl https://exemple.com' }], ['qa', 'Write', { file_path: path.join(R, 'droits/roles.json') }],
    ['reviewer', 'Bash', { command: 'git push origin main' }], ['architecte', 'WebFetch', { url: 'https://exemple.com' }], ['directeur', 'SendMessage', {}]])
    assert.deepStrictEqual(d(role, outil, entree), { ok: true, libre: true }, outil);
  const s = pa.settings(R);
  assert.strictEqual(s.sandbox.enabled, false); assert.deepStrictEqual(s.permissions.deny, []);
  assert.ok(s.hooks.PreToolUse, 'la garde reste branchée pour journaliser');
  libre.desactiver(R);
  assert.ok(!d('dev-backend', 'Bash', { command: 'curl https://exemple.com' }).ok);
  assert.strictEqual(pa.settings(R).sandbox.enabled, true);
});

test('échéance : un mode expiré compte comme inactif', () => {
  libre.activer(R, 1);
  assert.ok(libre.lire(R, Date.now() + 2 * 3600e3).expire);
  assert.ok(!libre.lire(R, Date.now() + 2 * 3600e3).actif);
  const f = path.join(R, 'droits', 'mode-libre.json'), j = JSON.parse(fs.readFileSync(f, 'utf8'));
  fs.writeFileSync(f, JSON.stringify({ ...j, jusqua: new Date(Date.now() - 1000).toISOString() }));
  assert.ok(!d('dev-backend', 'Bash', { command: 'curl https://exemple.com' }).ok, 'expiré : la garde refuse de nouveau');
  libre.activer(R, 0);
  assert.ok(libre.actif(R) && libre.lire(R).jusqua === null, 'sans limite de durée');
  libre.desactiver(R);
});
