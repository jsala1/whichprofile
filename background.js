// Service worker : reçoit les pings, résout l'identité du profil, filtre, débounce, annonce.
// Aucun état en mémoire qui ne soit reconstruisible depuis chrome.storage (le SW peut s'endormir à tout moment).
importScripts('lib/sites.js', 'lib/parse.js', 'lib/config.js', 'lib/i18n.js');

const { isKnownHost, siteLabel } = globalThis.WHICHPROFILE_SITES;
const { createDebouncer } = globalThis.WHICHPROFILE_PARSE;
const { DEBOUNCE_MS, reconcile, isSourceEnabled, shouldAnnounce, pickVoice, localVoices, announcementText, pushRecentPing } =
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

// Les voix du système arrivent ≈ 2 s après le démarrage de Chrome : on attend un peu une voix locale.
async function loadLocalVoices() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const voices = localVoices(await chrome.tts.getVoices());
    if (voices.length > 0) return voices;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return [];
}

async function speak(config, siteText) {
  const { label, lang, voiceName } = config.identity;
  const chosen = pickVoice(await loadLocalVoices(), lang, voiceName);
  if (!chosen) {
    // Jamais de voix réseau : sans voix locale, le motif sonore remplace la voix.
    console.warn('[WhichProfile] aucune voix locale : motif sonore à la place');
    await playPattern(config.identity.pattern);
    return;
  }
  const options = {
    voiceName: chosen,
    lang,
    rate: 1.1,
    // enqueue:true : le moteur TTS est partagé entre profils, false couperait l'annonce d'un autre profil.
    enqueue: true,
    onEvent: (event) => {
      if (event.type === 'error') console.warn('[WhichProfile] tts error', event.errorMessage);
      if (config.debug) console.info('[WhichProfile] tts', event.type);
    },
  };
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

// --- Agent mode -------------------------------------------------------------------
// Opt-in : chip avec le libellé sur chaque page + data-whichprofile sur <html>, pour les agents IA de navigation.
// Permissions optionnelles demandées par la page d'options ; l'état actif = config.agentMode ET permissions accordées.

const AGENT_SCRIPT_ID = 'whichprofile-agent-chip';
const AGENT_PERMISSIONS = { permissions: ['scripting'], origins: ['<all_urls>'] };
const AGENT_FILES = ['lib/chip.js', 'agent/chip.js'];

function agentPermitted() {
  return chrome.permissions.contains(AGENT_PERMISSIONS);
}

async function setAgentMode(enabled) {
  const config = await loadConfig();
  if (config.agentMode === enabled) return config;
  config.agentMode = enabled;
  await chrome.storage.local.set({ config });
  return config;
}

// Aligne l'enregistrement du content script sur la config et les permissions (démarrage, changements).
async function syncAgentMode() {
  const permitted = await agentPermitted();
  let config = await loadConfig();
  if (config.agentMode && !permitted) config = await setAgentMode(false); // permission retirée dans chrome://extensions
  const active = config.agentMode && permitted;
  if (!chrome.scripting) return active;
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [AGENT_SCRIPT_ID] });
  if (active && registered.length === 0) {
    await chrome.scripting.registerContentScripts([
      {
        id: AGENT_SCRIPT_ID,
        js: AGENT_FILES,
        matches: ['<all_urls>'],
        runAt: 'document_idle',
        allFrames: false,
        persistAcrossSessions: true,
      },
    ]);
  } else if (!active && registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [AGENT_SCRIPT_ID] });
  }
  return active;
}

async function enableAgentMode() {
  if (!(await agentPermitted())) return { ok: false, reason: 'permission-denied' };
  await setAgentMode(true);
  await syncAgentMode();
  // Le script enregistré ne vaut que pour les prochains chargements : on l'injecte aussi dans les onglets ouverts.
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) =>
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: AGENT_FILES }).catch(() => {}), // chrome://, Web Store…
    ),
  );
  console.info('[WhichProfile] agent mode activé');
  return { ok: true };
}

async function disableAgentMode() {
  await setAgentMode(false); // les chips déjà affichés se retirent via storage.onChanged
  await syncAgentMode();
  await chrome.storage.session.remove('agentHidden');
  // Le mode est déjà coupé à ce stade : un échec du retrait des permissions ne doit pas le faire paraître actif.
  try {
    if (await agentPermitted()) await chrome.permissions.remove(AGENT_PERMISSIONS);
  } catch (error) {
    console.warn('[WhichProfile] permissions non retirées', error);
  }
  console.info('[WhichProfile] agent mode désactivé');
  return { ok: true };
}

async function agentState(tabId) {
  const [config, permitted, { agentHidden = [] }] = await Promise.all([
    loadConfig(),
    agentPermitted(),
    chrome.storage.session.get('agentHidden'),
  ]);
  return { enabled: config.agentMode && permitted, label: config.identity.label, hidden: agentHidden.includes(tabId) };
}

async function hideAgentChip(tabId) {
  const { agentHidden = [] } = await chrome.storage.session.get('agentHidden');
  if (!agentHidden.includes(tabId)) await chrome.storage.session.set({ agentHidden: [...agentHidden, tabId] });
  return { ok: true };
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { agentHidden = [] } = await chrome.storage.session.get('agentHidden');
  if (agentHidden.includes(tabId)) await chrome.storage.session.set({ agentHidden: agentHidden.filter((id) => id !== tabId) });
});
chrome.permissions.onAdded.addListener(() => syncAgentMode());
chrome.permissions.onRemoved.addListener(() => syncAgentMode());
chrome.runtime.onStartup.addListener(() => syncAgentMode());

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
  else if (message.type === 'agent-enable' && fromExtensionPage) task = enableAgentMode();
  else if (message.type === 'agent-disable' && fromExtensionPage) task = disableAgentMode();
  else if (message.type === 'agent-state' && !fromExtensionPage && sender.tab) task = agentState(sender.tab.id);
  else if (message.type === 'agent-hide' && !fromExtensionPage && sender.tab) task = hideAgentChip(sender.tab.id);
  if (!task) return false;

  task.then(sendResponse, (error) => {
    console.error('[WhichProfile]', error);
    sendResponse({ ok: false, reason: String(error && error.message) });
  });
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  loadConfig().then((config) => console.info('[WhichProfile] prêt', { id: config.identity.id, label: config.identity.label }));
  syncAgentMode();
});
