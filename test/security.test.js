'use strict';

// Audit sécurité / vie privée (2026-09-30) : contrôles statiques des fichiers livrés, routage des messages,
// hook Notification exécuté dans un contexte isolé (vm).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { route, PING_SOURCES } = require('../lib/route.js');
const { agentEnableRefusal } = require('../lib/config.js');
const { hashString } = require('../lib/parse.js');

const root = path.join(__dirname, '..');

// --- Fichiers livrés : mêmes exclusions que scripts/pack.sh -------------------------------------------------
const EXCLUDED_DIRS = new Set(['.git', 'test', 'scripts', 'dist', 'store', 'node_modules']);
const EXCLUDED_FILES = new Set(['CLAUDE.md', 'README.md']);

function shippedFiles(dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return EXCLUDED_DIRS.has(entry.name) && dir === root ? [] : shippedFiles(full);
    if (dir === root && EXCLUDED_FILES.has(entry.name)) return [];
    if (full.endsWith('.svg') && path.basename(dir) === 'icons') return [];
    return [path.relative(root, full)];
  });
}

// Code seul : commentaires retirés (les commentaires peuvent citer ce qui est interdit).
const code = (file) =>
  fs.readFileSync(path.join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('fichiers livrés : aucune API réseau, aucun code dynamique, aucune injection HTML', () => {
  const files = shippedFiles().filter((f) => /\.(js|html)$/.test(f));
  assert.ok(files.includes('background.js') && files.includes('core/notification-hook.js') && files.includes('lib/route.js'));
  const forbidden = [
    'fetch(',
    'XMLHttpRequest',
    'WebSocket',
    'sendBeacon',
    'import(',
    'eval(',
    'new Function',
    'innerHTML',
    'insertAdjacentHTML',
    'document.write',
  ];
  for (const file of files) {
    const source = code(file);
    for (const token of forbidden) assert.ok(!source.includes(token), `${file} contient ${token}`);
  }
});

test('options.css : aucune ressource externe (ni url( ni @import)', () => {
  const css = fs.readFileSync(path.join(root, 'options.css'), 'utf8');
  assert.ok(!css.includes('url('));
  assert.ok(!css.includes('@import'));
});

test('manifest : CSP explicite des pages de l’extension', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(
    manifest.content_security_policy.extension_pages,
    "script-src 'self'; object-src 'none'; connect-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'",
  );
});

test('background.js : aucun log du libellé ni de l’identifiant du compte', () => {
  const source = code('background.js');
  assert.ok(!/console\.\w+\([^)]*identity\.(id|label|email)\b(?!\s*\?)/.test(source.replace(/!!config\.identity\.email/g, '')));
  assert.match(source, /hasAccount: !!config\.identity\.email/);
});

// --- Routage ---------------------------------------------------------------------------------------------
const ORIGIN = 'chrome-extension://abcdef/';
const page = { url: `${ORIGIN}options.html` };
const tab = { url: 'https://web.whatsapp.com/', tab: { id: 7 } };

test('route : les 7 messages acceptés', () => {
  assert.equal(route({ type: 'ping', source: 'title' }, tab, ORIGIN), 'ping');
  assert.equal(route({ type: 'test' }, page, ORIGIN), 'test');
  assert.equal(route({ type: 'get-config' }, page, ORIGIN), 'get-config');
  assert.equal(route({ type: 'agent-enable' }, page, ORIGIN), 'agent-enable');
  assert.equal(route({ type: 'agent-disable' }, page, ORIGIN), 'agent-disable');
  assert.equal(route({ type: 'agent-state' }, tab, ORIGIN), 'agent-state');
  assert.equal(route({ type: 'agent-hide' }, tab, ORIGIN), 'agent-hide');
  for (const source of PING_SOURCES) assert.equal(route({ type: 'ping', source }, tab, ORIGIN), 'ping', source);
});

test('route : les 4 refus demandés', () => {
  assert.equal(route({ type: 'ping', source: 'title' }, page, ORIGIN), null); // ping depuis une page de l'extension
  assert.equal(route({ type: 'get-config' }, tab, ORIGIN), null); // get-config depuis un content script
  assert.equal(route({ type: 'agent-state' }, { url: 'https://x.com/' }, ORIGIN), null); // agent-state sans onglet
  assert.equal(route({ type: 'ping', source: 'evil' }, tab, ORIGIN), null); // source inconnue
});

test('route : messages malformés, offscreen et types inconnus ignorés', () => {
  assert.equal(route(null, tab, ORIGIN), null);
  assert.equal(route('ping', tab, ORIGIN), null);
  assert.equal(route({ type: 'play', target: 'offscreen' }, page, ORIGIN), null);
  assert.equal(route({ type: 'agent-enable' }, tab, ORIGIN), null);
  assert.equal(route({ type: 'whatever' }, page, ORIGIN), null);
  assert.equal(route({ type: 'ping' }, tab, ORIGIN), null); // source absente
});

test('SW : activation Agent mode refusée quand le libellé est l’e-mail (pas seulement dans l’UI)', () => {
  const email = 'julian@example.com';
  assert.equal(agentEnableRefusal({ email, label: 'julian', labelIsDefault: true }, true), 'label-is-email');
  assert.equal(agentEnableRefusal({ email, label: 'julian', labelIsDefault: false }, true), 'label-is-email');
  assert.equal(agentEnableRefusal({ email, label: 'Agence', labelIsDefault: false }, false), 'permission-denied');
  assert.equal(agentEnableRefusal({ email, label: 'Agence', labelIsDefault: false }, true), null);
  assert.equal(agentEnableRefusal({ email: '', label: 'profil sans compte', labelIsDefault: true }, true), null);
});

test('hashString : empreinte stable, courte, sans le texte', () => {
  assert.equal(hashString('Re: offre Serendyme'), hashString('Re: offre Serendyme'));
  assert.notEqual(hashString('Inbox'), hashString('Boîte de réception'));
  assert.match(hashString('Re: offre Serendyme'), /^[0-9a-f]{8}$/);
});

// --- Hook Notification dans un contexte isolé --------------------------------------------------------------
function loadHook(permission) {
  const events = [];
  const argReads = [];
  class FakeNotification {
    constructor() {
      // L'API d'origine du test ne lit pas ses arguments non plus : toute lecture viendrait du hook.
    }
    static get permission() {
      return permission;
    }
    static requestPermission() {
      return Promise.resolve(permission);
    }
  }
  class FakeRegistration {}
  FakeRegistration.prototype.showNotification = function showNotification() {
    return Promise.resolve();
  };
  const sandbox = {
    Notification: FakeNotification,
    ServiceWorkerRegistration: FakeRegistration,
    document: { dispatchEvent: (event) => events.push(event.type) },
    CustomEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'core/notification-hook.js'), 'utf8'), sandbox);
  // Options piégées : toute lecture de propriété par le hook est enregistrée.
  const spyArgs = new Proxy({}, { get: (t, prop) => (argReads.push(prop), undefined), has: (t, prop) => (argReads.push(prop), false) });
  return { sandbox, Original: FakeNotification, events, argReads, spyArgs };
}

test('hook : new Notification reste une vraie instance, permission et requestPermission intacts', () => {
  const { sandbox, Original } = loadHook('granted');
  assert.notEqual(sandbox.Notification, Original); // bien remplacé par le Proxy
  const instance = new sandbox.Notification('titre', { body: 'texte' });
  assert.ok(instance instanceof Original);
  assert.ok(instance instanceof sandbox.Notification);
  assert.equal(sandbox.Notification.permission, 'granted');
  assert.equal(typeof sandbox.Notification.requestPermission, 'function');
  assert.equal(sandbox.Notification.prototype, Original.prototype);
});

test('hook : aucun accès aux arguments (titre, options)', async () => {
  const { sandbox, argReads, spyArgs } = loadHook('granted');
  new sandbox.Notification('titre', spyArgs);
  await new sandbox.ServiceWorkerRegistration().showNotification('titre', spyArgs);
  assert.deepEqual(argReads, []);
});

test('hook : signal émis seulement si Notification.permission === "granted"', async () => {
  const granted = loadHook('granted');
  new granted.sandbox.Notification('a');
  await new granted.sandbox.ServiceWorkerRegistration().showNotification('b');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(granted.events, ['whichprofile:notif', 'whichprofile:notif']);

  for (const permission of ['default', 'denied']) {
    const other = loadHook(permission);
    new other.sandbox.Notification('a');
    await new other.sandbox.ServiceWorkerRegistration().showNotification('b');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(other.events, [], permission);
  }
});

test('hook : aucun Symbol ni propriété ajoutés, rien de détectable par la marque', () => {
  const { sandbox, Original } = loadHook('granted');
  assert.deepEqual(Reflect.ownKeys(sandbox.Notification), Reflect.ownKeys(Original));
  assert.equal(Object.getOwnPropertySymbols(sandbox.Notification).length, 0);
  assert.equal(sandbox.Notification[Symbol.for('whichprofile.wrapped')], undefined);
  const show = sandbox.ServiceWorkerRegistration.prototype.showNotification;
  assert.equal(Object.getOwnPropertySymbols(show).length, 0);
  assert.equal(show[Symbol.for('whichprofile.wrapped')], undefined);
  assert.ok(!code('core/notification-hook.js').includes('Symbol'));
});
