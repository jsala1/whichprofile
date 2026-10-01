'use strict';

// Réinjection des content scripts dans les onglets déjà ouverts (install / update), garde anti-double exécution,
// scripts orphelins, permissions de l'Agent mode.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planReinjection } = require('../lib/reinject.js');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const code = (file) =>
  fs.readFileSync(path.join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('install : tous les blocs du manifest, hook MAIN d’abord, puis bridge, puis les autres', () => {
  const plan = planReinjection(manifest, 'install');
  assert.equal(plan.length, manifest.content_scripts.length);
  assert.deepEqual(plan.map((b) => b.files.join('+')), [
    'core/notification-hook.js',
    'core/bridge.js',
    'lib/parse.js+core/title-watcher.js',
    'lib/parse.js+adapters/gmail.js',
  ]);
  assert.deepEqual(plan[0].world, 'MAIN');
  assert.ok(plan.slice(1).every((b) => b.world === 'ISOLATED'));
});

test('update : pas de bloc MAIN (le hook de la version précédente reste actif), bridge en premier', () => {
  const plan = planReinjection(manifest, 'update');
  assert.ok(plan.every((b) => b.world === 'ISOLATED'));
  assert.ok(!plan.some((b) => b.files.includes('core/notification-hook.js')));
  assert.deepEqual(plan[0].files, ['core/bridge.js']);
  assert.equal(plan.length, manifest.content_scripts.length - 1);
});

test('autres raisons (chrome_update, shared_module_update) : rien', () => {
  assert.deepEqual(planReinjection(manifest, 'chrome_update'), []);
  assert.deepEqual(planReinjection(manifest, 'shared_module_update'), []);
  assert.deepEqual(planReinjection(manifest, undefined), []);
});

test('le plan reprend exactement les matches, fichiers et all_frames du manifest (source unique)', () => {
  const plan = planReinjection(manifest, 'install');
  for (const block of manifest.content_scripts) {
    const planned = plan.find((b) => b.files.join() === block.js.join());
    assert.ok(planned, block.js.join());
    assert.deepEqual(planned.matches, block.matches);
    assert.equal(planned.allFrames, !!block.all_frames);
    assert.equal(planned.world, block.world === 'MAIN' ? 'MAIN' : 'ISOLATED');
  }
  // Aucun bloc ne dépend d'exclude_matches, que la réinjection ne reproduit pas.
  assert.ok(manifest.content_scripts.every((block) => !block.exclude_matches && !block.include_globs && !block.exclude_globs));
});

test('planReinjection : fonction pure, aucun hôte en dur', () => {
  const source = code('lib/reinject.js');
  assert.ok(!/https?:\/\//.test(source));
  const fake = { content_scripts: [{ matches: ['https://a.test/*'], js: ['x.js'], world: 'MAIN' }, { matches: ['https://a.test/*'], js: ['core/bridge.js'] }] };
  assert.deepEqual(planReinjection(fake, 'update'), [{ matches: ['https://a.test/*'], files: ['core/bridge.js'], world: 'ISOLATED', allFrames: false }]);
});

test('background.js : réinjection à install/update depuis getManifest(), onglets en veille ignorés, log sans URL', () => {
  const source = code('background.js');
  assert.match(source, /planReinjection\(chrome\.runtime\.getManifest\(\), reason\)/);
  assert.match(source, /details\.reason === 'install' \|\| details\.reason === 'update'\) reinjectContentScripts\(details\.reason\)/);
  assert.match(source, /chrome\.tabs\.query\(\{ url: block\.matches \}\)/);
  assert.match(source, /if \(tab\.discarded/);
  assert.match(source, /target: \{ tabId: tab\.id, allFrames: block\.allFrames \}/);
  assert.match(source, /console\.info\('\[WhichProfile\] réinjecté', \{ reason, onglets: reached\.size \}\)/);
  const reinject = source.slice(source.indexOf('async function reinjectContentScripts'), source.indexOf('chrome.runtime.onInstalled'));
  assert.ok(!/https?:\/\//.test(reinject), 'aucun hôte en dur dans la réinjection');
});

test('Agent mode : AGENT_PERMISSIONS ne contient plus scripting (sinon permissions.remove échoue), seulement <all_urls>', () => {
  for (const file of ['background.js', 'options.js']) {
    const line = code(file).match(/const AGENT_PERMISSIONS = (\{[^}]*\});/);
    assert.ok(line, file);
    assert.equal(line[1], "{ origins: ['<all_urls>'] }", file);
  }
});

test('garde anti-double exécution dans les 3 scripts ISOLATED réinjectables (monde isolé seulement)', () => {
  for (const [file, flag] of [
    ['core/bridge.js', '__whichprofileBridge'],
    ['core/title-watcher.js', '__whichprofileTitleWatcher'],
    ['adapters/gmail.js', '__whichprofileGmail'],
  ]) {
    const source = code(file);
    assert.match(source, new RegExp(`if \\(globalThis\\.${flag}\\) return;\\s*globalThis\\.${flag} = true;`), file);
  }
  // Aucune marque dans le monde MAIN (hook) : pas d'empreinte détectable par la page.
  assert.ok(!/globalThis\.__whichprofile|window\.__whichprofile/.test(code('core/notification-hook.js')));
});

test('scripts orphelins : bridge se désinscrit comme title-watcher (stop) et gmail (alive = false)', () => {
  assert.match(code('core/bridge.js'), /catch \(_\) \{\s*document\.removeEventListener\('whichprofile:notif', onNotification\);/);
  assert.match(code('core/title-watcher.js'), /catch \(_\) \{\s*stop\(\);/);
  assert.match(code('adapters/gmail.js'), /alive = false/);
});
