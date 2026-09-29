'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { HOSTS, siteLabel, matchPatterns } = require('../lib/sites.js');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const scripts = manifest.content_scripts;
const entryFor = (file) => scripts.find((entry) => entry.js.includes(file));
const sorted = (list) => [...list].sort();

test('hook et bridge couvrent exactement la liste de sites.js', () => {
  assert.deepEqual(sorted(entryFor('core/notification-hook.js').matches), sorted(matchPatterns()));
  assert.deepEqual(sorted(entryFor('core/bridge.js').matches), sorted(matchPatterns()));
});

test('title-watcher couvre tous les sites sauf Gmail, adaptateur Gmail seul sur Gmail', () => {
  const withoutGmail = matchPatterns().filter((m) => m !== 'https://mail.google.com/*');
  assert.deepEqual(sorted(entryFor('core/title-watcher.js').matches), sorted(withoutGmail));
  assert.deepEqual(entryFor('adapters/gmail.js').matches, ['https://mail.google.com/*']);
});

test('lib/parse.js est chargé avant les scripts qui l’utilisent', () => {
  for (const file of ['core/title-watcher.js', 'adapters/gmail.js']) {
    const js = entryFor(file).js;
    assert.ok(js.indexOf('lib/parse.js') > -1 && js.indexOf('lib/parse.js') < js.indexOf(file), file);
  }
});

test('hook en MAIN world à document_start', () => {
  const hook = entryFor('core/notification-hook.js');
  assert.equal(hook.world, 'MAIN');
  assert.equal(hook.run_at, 'document_start');
});

test('permissions : liste fermée, aucune host permission obligatoire ; Agent mode en optionnel seulement', () => {
  assert.deepEqual(sorted(manifest.permissions), sorted(['identity', 'identity.email', 'offscreen', 'storage', 'tts']));
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.optional_permissions, ['scripting']);
  assert.deepEqual(manifest.optional_host_permissions, ['<all_urls>']);
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, '116');
});

test('libellés parlés', () => {
  assert.equal(siteLabel('mail.google.com'), 'Gmail');
  assert.equal(siteLabel('x.com'), 'X');
  assert.equal(siteLabel('outlook.office.com'), 'Outlook');
  assert.equal(siteLabel('outlook.live.com'), 'Outlook');
  assert.equal(HOSTS.length, 12);
});

test('tous les fichiers référencés par le manifest existent', () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
    ...scripts.flatMap((entry) => entry.js),
    'offscreen.html',
    // Agent mode : enregistrés dynamiquement par background.js, donc absents des content_scripts du manifest.
    'lib/chip.js',
    'agent/chip.js',
  ];
  for (const file of files) assert.ok(fs.existsSync(path.join(root, file)), file);
});
