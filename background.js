// Service worker : reçoit les pings, résout l'identité du profil, filtre, débounce, annonce.
// Aucun état en mémoire qui ne soit reconstruisible depuis chrome.storage (le SW peut s'endormir à tout moment).
importScripts('lib/sites.js', 'lib/parse.js', 'lib/config.js');

const { isKnownHost, siteLabel } = globalThis.LEQUEL_SITES;
const { createDebouncer } = globalThis.LEQUEL_PARSE;
const { reconcile, isSourceEnabled, shouldAnnounce, pickVoice, announcementText } = globalThis.LEQUEL_CONFIG;

const DEBOUNCE_MS = 3000;
const OFFSCREEN_URL = 'offscreen.html';
const TEST_SITE_LABEL = 'Test';

const debouncer = createDebouncer({
  windowMs: DEBOUNCE_MS,
  load: async (key) => (await chrome.storage.session.get(`debounce:${key}`))[`debounce:${key}`],
  save: (key, at) => chrome.storage.session.set({ [`debounce:${key}`]: at }),
});

// --- Identité et configuration -------------------------------------------------

async function profileEmail() {
  try {
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
    return (info && info.email) || '';
  } catch (_) {
    return '';
  }
}

async function loadConfig() {
  const [{ config: stored }, email] = await Promise.all([chrome.storage.local.get('config'), profileEmail()]);
  const config = reconcile(stored, email);
  if (JSON.stringify(config) !== JSON.stringify(stored)) await chrome.storage.local.set({ config });
  return config;
}

// --- Annonce -------------------------------------------------------------------

async function speak(config, siteText) {
  const { label, lang, voiceName } = config.identity;
  const voices = await chrome.tts.getVoices();
  const chosen = pickVoice(voices, lang, voiceName);
  const options = {
    lang,
    rate: 1.1,
    // enqueue:true : le moteur TTS est partagé entre profils, false couperait l'annonce d'un autre profil.
    enqueue: true,
    onEvent: (event) => {
      if (event.type === 'error') console.warn('[Lequel] tts error', event.errorMessage);
      if (config.debug) console.info('[Lequel] tts', event.type);
    },
  };
  if (chosen) options.voiceName = chosen;
  chrome.tts.speak(announcementText(siteText, label), options);
}

let creatingOffscreen = null;

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  if (contexts.length > 0) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({ url: OFFSCREEN_URL, reasons: ['AUDIO_PLAYBACK'], justification: 'play identity sound' })
      .finally(() => {
        creatingOffscreen = null;
      });
  }
  await creatingOffscreen;
}

async function playPattern(pattern) {
  await ensureOffscreen();
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'play', pattern });
}

async function announce(config, siteText) {
  if (config.identity.mode === 'sound') await playPattern(config.identity.pattern);
  else await speak(config, siteText);
}

// --- Routage des pings -----------------------------------------------------------

function senderHost(sender) {
  try {
    return new URL(sender.origin || sender.url).hostname;
  } catch (_) {
    return '';
  }
}

// Sur Gmail, une notification du hook est rattachée au chat si elle vient d'une frame /chat…, sinon au mail.
function resolveSource(source, host, sender) {
  if (host !== 'mail.google.com' || source !== 'notification') return source;
  let path = '';
  try {
    path = new URL(sender.url).pathname;
  } catch (_) {
    /* about:blank */
  }
  return path.startsWith('/chat') ? 'gmail-chat' : 'gmail-mail';
}

async function handlePing(message, sender) {
  const host = senderHost(sender);
  if (!isKnownHost(host)) return { ok: false, reason: 'unknown-site' };

  const config = await loadConfig();
  const source = resolveSource(message.source, host, sender);
  if (!isSourceEnabled(config, source)) {
    if (config.debug) console.info('[Lequel] ping ignoré (source désactivée)', { site: host, source });
    return { ok: true, announced: false, reason: 'source-disabled' };
  }

  if (!(await debouncer.hit(host))) {
    if (config.debug) console.info('[Lequel] ping absorbé (debounce)', { site: host, source });
    return { ok: true, announced: false, reason: 'debounced' };
  }

  const now = Date.now();
  const announced = shouldAnnounce(config, now);
  // Dernier ping : site, source, heure. Jamais de contenu.
  await chrome.storage.session.set({ lastPing: { site: host, siteLabel: siteLabel(host), source, at: now, announced } });
  console.info('[Lequel] ping', { site: host, source, announced });

  if (announced) await announce(config, siteLabel(host));
  return { ok: true, announced, reason: announced ? 'announced' : 'muted' };
}

// Bouton « Tester » : même chemin d'annonce, sans mute ni debounce.
async function handleTest() {
  const config = await loadConfig();
  console.info('[Lequel] test', { mode: config.identity.mode, label: config.identity.label });
  await announce(config, TEST_SITE_LABEL);
  return { ok: true, mode: config.identity.mode, text: announcementText(TEST_SITE_LABEL, config.identity.label) };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target === 'offscreen') return false;

  // Les pages de l'extension (options, popup) ont une URL chrome-extension:// ; les content scripts, celle du site.
  const fromExtensionPage = typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''));
  let task = null;
  if (message.type === 'ping' && !fromExtensionPage) task = handlePing(message, sender);
  else if (message.type === 'test' && fromExtensionPage) task = handleTest();
  else if (message.type === 'get-config' && fromExtensionPage) task = loadConfig().then((config) => ({ ok: true, config }));
  if (!task) return false;

  task.then(sendResponse, (error) => {
    console.error('[Lequel]', error);
    sendResponse({ ok: false, reason: String(error && error.message) });
  });
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  loadConfig().then((config) => console.info('[Lequel] prêt', { id: config.identity.id, label: config.identity.label }));
});
