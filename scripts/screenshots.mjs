// Captures brutes pour la fiche Chrome Web Store → store/screenshots/raw/ (deviceScaleFactor 2).
// Node pur (WebSocket et fetch natifs, Node ≥ 22), aucune dépendance : pilote Chrome via le protocole DevTools.
//
//   CHROME="/chemin/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" node scripts/screenshots.mjs
//
// Chrome stable n'accepte plus --load-extension : utiliser Chrome for Testing
// (https://googlechromelabs.github.io/chrome-for-testing/).
//
// - Profil jetable (supprimé à la fin), sans compte Google : aucun e-mail à l'image.
// - Libellé « Agency », mode voix.
// - L'extension chargée est une COPIE temporaire où scripting et <all_urls> sont déjà accordés : la boîte de
//   permission native de l'Agent mode ne s'automatise pas. Tout le reste suit le vrai chemin (clic sur
//   l'interrupteur, service worker, script enregistré).
// - Le badge est capturé sur scripts/fixtures/article.html, servi en http://127.0.0.1 (en file://, le script
//   de l'Agent mode ne s'injecte pas sans l'option « Autoriser l'accès aux URL de fichier »).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'store', 'screenshots', 'raw');
const CHROME = process.env.CHROME;
const PORT = 9333;
const SCALE = 2;
const LABEL = 'Agency';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!CHROME || !fs.existsSync(CHROME)) {
  console.error('Variable CHROME manquante ou invalide : chemin de l’exécutable Chrome for Testing.');
  process.exit(1);
}

// --- Copie de l'extension, permissions de l'Agent mode déjà accordées ------------------------------------
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'whichprofile-shots-'));
const extension = path.join(work, 'extension');
const skip = new Set(['.git', 'dist', 'store', 'test', 'scripts', 'docs', 'node_modules']);
fs.cpSync(ROOT, extension, { recursive: true, filter: (src) => !skip.has(path.relative(ROOT, src).split(path.sep)[0]) });
const manifestPath = path.join(extension, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.permissions = [...manifest.permissions, ...manifest.optional_permissions];
manifest.host_permissions = manifest.optional_host_permissions;
delete manifest.optional_permissions;
delete manifest.optional_host_permissions;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// --- Page neutre servie en local ---------------------------------------------------------------------------
const fixture = fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'article.html'));
const server = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fixture));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const fixtureUrl = `http://127.0.0.1:${server.address().port}/article.html`;

// --- Chrome ------------------------------------------------------------------------------------------------
const chrome = spawn(
  CHROME,
  [
    `--user-data-dir=${path.join(work, 'profile')}`,
    `--load-extension=${extension}`,
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--lang=en-US',
    ...(process.platform === 'darwin' ? ['-AppleLanguages', '(en)'] : []),
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const problems = [];

async function cdp(url, name) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method === 'Runtime.exceptionThrown') {
      problems.push(`${name}: ${message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text}`);
    } else if (message.method === 'Log.entryAdded' && /error/i.test(message.params.entry.level)) {
      problems.push(`${name}: ${message.params.entry.text}`);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const current = ++id;
      pending.set(current, resolve);
      ws.send(JSON.stringify({ id: current, method, params }));
    });
  await send('Runtime.enable');
  await send('Log.enable');
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (response.result?.exceptionDetails) throw new Error(`${name}: ${JSON.stringify(response.result.exceptionDetails)}`);
    return response.result?.result?.value;
  };
  return { send, evaluate };
}

const list = async () => (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();

async function waitFor(predicate, label) {
  for (let i = 0; i < 80; i++) {
    const found = (await list()).find(predicate);
    if (found) return found;
    await sleep(250);
  }
  throw new Error(`introuvable : ${label}`);
}

async function open(browser, url, match, name) {
  await browser.send('Target.createTarget', { url });
  return cdp((await waitFor((t) => t.type === 'page' && match(t.url), name)).webSocketDebuggerUrl, name);
}

async function scheme(page, value) {
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
  await sleep(300);
}

// viewport : largeur de mise en page (ne pas la réduire au cadre, sinon la page se remet en page autrement).
async function shoot(page, file, clip, viewport = { width: Math.ceil(clip.x + clip.width), height: Math.ceil(clip.y + clip.height) }) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: Math.max(viewport.height, Math.ceil(clip.y + clip.height)),
    deviceScaleFactor: SCALE,
    mobile: false,
  });
  await sleep(400);
  const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(shot.result.data, 'base64'));
  console.log('écrit', path.join('store/screenshots/raw', file));
}

// Hauteur réelle d'une page à une largeur donnée.
async function pageHeight(page, width) {
  await page.send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: SCALE, mobile: false });
  await sleep(300);
  return page.evaluate('Math.ceil(document.documentElement.getBoundingClientRect().height)');
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/json/version`);
      break;
    } catch {
      await sleep(250);
    }
  }
  const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const browser = await cdp(version.webSocketDebuggerUrl, 'browser');

  const workerTarget = await waitFor(
    (t) => t.type === 'service_worker' && t.url.endsWith('/background.js') && t.url.startsWith('chrome-extension://'),
    'service worker',
  );
  // Le premier service worker trouvé peut être un composant de Chrome : on garde celui dont le manifest est le nôtre.
  let extensionId = null;
  for (const t of (await list()).filter((t) => t.type === 'service_worker' && t.url.endsWith('/background.js'))) {
    const worker = await cdp(t.webSocketDebuggerUrl, 'sw');
    if ((await worker.evaluate('chrome.runtime.getManifest().homepage_url')) === 'https://whichprofile.app') extensionId = new URL(t.url).host;
  }
  if (!extensionId) throw new Error(`service worker WhichProfile introuvable (${workerTarget.url})`);
  const extUrl = (file) => `chrome-extension://${extensionId}/${file}`;

  // Options : libellé de démo, mode voix
  const options = await open(browser, extUrl('options.html'), (u) => u.endsWith('/options.html'), 'options');
  await sleep(1500);
  await options.evaluate(`(() => { const i = document.getElementById('label'); i.value = ${JSON.stringify(LABEL)}; i.dispatchEvent(new Event('change')); })()`);
  await options.evaluate(`document.querySelector('input[name="mode"][value="voice"]').click()`);
  await sleep(500);
  await options.evaluate('document.activeElement.blur(); scrollTo(0, 0)');

  for (const theme of ['light', 'dark']) {
    await scheme(options, theme);
    const height = await pageHeight(options, 1000);
    await shoot(options, `options-${theme}.png`, { x: 0, y: 0, width: 1000, height });
  }

  // Popup à sa taille réelle
  const popup = await open(browser, extUrl('popup.html'), (u) => u.endsWith('/popup.html'), 'popup');
  await sleep(1200);
  for (const theme of ['light', 'dark']) {
    await scheme(popup, theme);
    const height = await pageHeight(popup, 320);
    await shoot(popup, `popup-${theme}.png`, { x: 0, y: 0, width: 320, height });
  }

  // Agent mode : clic sur l'interrupteur (permissions déjà accordées dans cette copie), puis la section
  await scheme(options, 'light');
  await options.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: SCALE, mobile: false });
  await options.evaluate(`document.getElementById('agent').click()`);
  await sleep(2500);
  const enabled = await options.evaluate(`document.getElementById('agent').checked && !document.getElementById('agent-preview').hidden`);
  if (!enabled) throw new Error('Agent mode non activé');
  const height = await pageHeight(options, 1000);
  const rect = await options.evaluate(
    `(() => { scrollTo(0, 0); const r = document.getElementById('agent').closest('section').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`,
  );
  await shoot(
    options,
    'agent-toggle-on.png',
    { x: Math.floor(rect.x) - 16, y: Math.floor(rect.y) - 16, width: Math.ceil(rect.width) + 32, height: Math.ceil(rect.height) + 32 },
    { width: 1000, height },
  );

  // Badge sur une page locale neutre
  const article = await open(browser, fixtureUrl, (u) => u.startsWith(fixtureUrl), 'article');
  await sleep(2500);
  const badges = await article.evaluate(`document.getElementsByTagName('whichprofile-chip').length`);
  if (badges !== 1) throw new Error(`badge absent de la page neutre (${badges})`);
  await shoot(article, 'badge-neutral.png', { x: 0, y: 0, width: 1280, height: 800 });

  // Remise à l'état initial (Agent mode coupé)
  await options.evaluate(`document.getElementById('agent').click()`);
  await sleep(1000);

  if (problems.length) {
    console.error('Erreurs relevées pendant les captures :\n' + problems.join('\n'));
    process.exitCode = 1;
  }
  await browser.send('Browser.close').catch(() => {});
} finally {
  server.close();
  chrome.kill();
  await sleep(500);
  fs.rmSync(work, { recursive: true, force: true });
}
