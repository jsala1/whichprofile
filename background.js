// Service worker : reçoit les pings, résout l'identité du profil, filtre, débounce, annonce.
// Aucun état en mémoire qui ne soit reconstruisible depuis chrome.storage (le SW peut s'endormir à tout moment).
importScripts('lib/sites.js', 'lib/parse.js', 'lib/config.js', 'lib/i18n.js');

const { isKnownHost, siteLabel } = globalThis.WHICHPROFILE_SITES;
const { createDebouncer } = globalThis.WHICHPROFILE_PARSE;
const { DEBOUNCE_MS, reconcile, isSourceEnabled, shouldAnnounce, pickVoice, announcementText, pushRecentPing } =
  globalThis.WHICHPROFILE_CONFIG;
const { t, localeDefaults } = globalThis.WHICHPROFILE_I18N;

const OFFSCREEN_URL = 'offscreen.html';

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
  const config = reconcile(stored, email, localeDefaults());
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
      if (event.type === 'error') console.warn('[WhichProfile] tts error', event.errorMessage);
      if (config.debug) console.info('[WhichProfile] tts', event.type);
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

// Derniers pings pour le popup : heure, site, source, annoncé ou non et pourquoi. Jamais de contenu.
// Écritures sérialisées : deux pings simultanés ne doivent pas s'écraser.
let recentQueue = Promise.resolve();
function recordPing(entry) {
  recentQueue = recentQueue
    .then(async () => {
      const { recentPings } = await chrome.storage.session.get('recentPings');
      await chrome.storage.session.set({ recentPings: pushRecentPing(recentPings, entry) });
    })
    .catch((error) => console.warn('[WhichProfile] recentPings', error));
  return recentQueue;
}

async function handlePing(message, sender) {
  const host = senderHost(sender);
  if (!isKnownHost(host)) return { ok: false, reason: 'unknown-site' };

  const now = Date.now();
  const config = await loadConfig();
  const source = resolveSource(message.source, host, sender);

  let status;
  if (!isSourceEnabled(config, source)) status = 'source-disabled';
  else if (!(await debouncer.hit(host, now))) status = 'debounced';
  else status = shouldAnnounce(config, now) ? 'announced' : 'muted';

  const announced = status === 'announced';
  await recordPing({ at: now, site: host, siteLabel: siteLabel(host), source, announced, status });
  if (announced || status === 'muted' || config.debug) console.info('[WhichProfile] ping', { site: host, source, status });

  if (announced) await announce(config, siteLabel(host));
  return { ok: true, announced, reason: status };
}

// Bouton « Tester » : même chemin d'annonce, sans mute ni debounce.
async function handleTest() {
  const config = await loadConfig();
  console.info('[WhichProfile] test', { mode: config.identity.mode, label: config.identity.label });
  const testLabel = t('testSiteLabel');
  await announce(config, testLabel);
  return { ok: true, mode: config.identity.mode, text: announcementText(testLabel, config.identity.label) };
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
    console.error('[WhichProfile]', error);
    sendResponse({ ok: false, reason: String(error && error.message) });
  });
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  loadConfig().then((config) => console.info('[WhichProfile] prêt', { id: config.identity.id, label: config.identity.label }));
});
