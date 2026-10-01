// Service worker : reçoit les pings, résout l'identité du profil, filtre, débounce, annonce.
// Aucun état en mémoire qui ne soit reconstruisible depuis chrome.storage (le SW peut s'endormir à tout moment).
importScripts('lib/sites.js', 'lib/parse.js', 'lib/config.js', 'lib/i18n.js', 'lib/route.js');

const { isKnownHost, siteLabel } = globalThis.WHICHPROFILE_SITES;
const { createDebouncer, createPingThrottle } = globalThis.WHICHPROFILE_PARSE;
const {
  DEBOUNCE_MS,
  reconcile,
  agentEnableRefusal,
  agentBadgeState,
  labelDerivedFromEmail,
  pingGate,
  shouldAnnounce,
  pickVoice,
  localVoices,
  announcementText,
  pushRecentPing,
} =
  globalThis.WHICHPROFILE_CONFIG;
const { t, localeDefaults } = globalThis.WHICHPROFILE_I18N;
const { route } = globalThis.WHICHPROFILE_ROUTE;

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

// Throttle d'entrée, en mémoire seulement : un ping de même `hôte|source` à moins de 250 ms du précédent est
// rejeté sans être enregistré. Appliqué APRÈS le test de source (pingGate). Perdu à la mise en veille du SW.
const PING_THROTTLE_MS = 250;
const pingThrottle = createPingThrottle(PING_THROTTLE_MS);

async function handlePing(message, sender) {
  const host = senderHost(sender);
  if (!isKnownHost(host)) return { ok: false, reason: 'unknown-site' };

  const now = Date.now();
  const config = await loadConfig();
  const source = resolveSource(message.source, host, sender);

  const gate = pingGate({ config, host, source, throttle: pingThrottle, now });
  if (gate === 'throttled') return { ok: true, announced: false, reason: 'throttled' };

  let status;
  if (gate === 'source-disabled') status = 'source-disabled';
  else if (!(await debouncer.hit(host, now))) status = 'debounced';
  else status = shouldAnnounce(config, now) ? 'announced' : 'muted';

  const announced = status === 'announced';
  await recordPing({ at: now, site: host, siteLabel: siteLabel(host), source, announced, status });
  if (announced || status === 'muted' || config.debug) console.info('[WhichProfile] ping', { site: host, source, status });

  if (announced) await announce(config, siteLabel(host));
  return { ok: true, announced, reason: status };
}

// --- Agent mode -------------------------------------------------------------------
// Opt-in : badge avec le libellé sur chaque page, pour les agents IA de navigation et les lecteurs d'écran.
// Le libellé n'est lisible qu'à l'écran et dans l'arbre d'accessibilité, jamais par les scripts de page.
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
// Sérialisé : permissions.onAdded et enableAgentMode peuvent lancer deux synchronisations en même temps.
let syncQueue = Promise.resolve();
function syncAgentMode() {
  const run = syncQueue.then(doSyncAgentMode);
  syncQueue = run.catch((error) => console.warn('[WhichProfile] agent sync', error));
  return run;
}

async function doSyncAgentMode() {
  const permitted = await agentPermitted();
  let config = await loadConfig();
  if (config.agentMode && !permitted) config = await setAgentMode(false); // permission retirée dans chrome://extensions
  const active = config.agentMode && permitted;
  if (!chrome.scripting) return active;
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [AGENT_SCRIPT_ID] });
  if (active && registered.length === 0) {
    try {
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
    } catch (error) {
      // Déjà enregistré par une synchronisation concurrente : c'est l'état voulu.
      if (!/Duplicate script ID/i.test(String(error && error.message))) throw error;
    }
  } else if (!active && registered.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [AGENT_SCRIPT_ID] });
  }
  return active;
}

async function enableAgentMode() {
  // Même garde que la page d'options, appliquée ici aussi : l'UI seule ne suffit pas.
  const refusal = agentEnableRefusal((await loadConfig()).identity, await agentPermitted());
  if (refusal) return { ok: false, reason: refusal };
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
  return agentBadgeState(config, permitted, agentHidden, tabId);
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
// Filet : libellé redevenu dérivé de l'e-mail alors que l'Agent mode est actif (options contournées, autre
// profil de sync, etc.) → on coupe le mode. Les badges, eux, sont déjà retirés par agentBadgeState.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.config) return;
  const config = changes.config.newValue;
  if (config && config.agentMode && labelDerivedFromEmail(config.identity)) {
    console.warn('[WhichProfile] libellé dérivé de l’e-mail : mode agent coupé');
    disableAgentMode();
  }
});
chrome.permissions.onRemoved.addListener(() => syncAgentMode());
chrome.runtime.onStartup.addListener(() => syncAgentMode());

// Bouton « Tester » : même chemin d'annonce, sans mute ni debounce.
async function handleTest() {
  const config = await loadConfig();
  console.info('[WhichProfile] test', { mode: config.identity.mode, hasAccount: !!config.identity.email });
  const testLabel = t('testSiteLabel');
  await announce(config, testLabel);
  return { ok: true, mode: config.identity.mode, text: announcementText(testLabel, config.identity.label) };
}

const HANDLERS = {
  ping: (message, sender) => handlePing(message, sender),
  test: () => handleTest(),
  'get-config': () => loadConfig().then((config) => ({ ok: true, config })),
  'agent-enable': () => enableAgentMode(),
  'agent-disable': () => disableAgentMode(),
  'agent-state': (message, sender) => agentState(sender.tab.id),
  'agent-hide': (message, sender) => hideAgentChip(sender.tab.id),
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // route() (lib/route.js) : origine du message, onglet, source de ping autorisée. null = ignoré.
  const action = route(message, sender, chrome.runtime.getURL(''));
  if (!action) return false;
  const task = HANDLERS[action](message, sender);

  task.then(sendResponse, (error) => {
    console.error('[WhichProfile]', error);
    sendResponse({ ok: false, reason: String(error && error.message) });
  });
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  loadConfig().then((config) => console.info('[WhichProfile] prêt', { hasAccount: !!config.identity.email }));
  syncAgentMode();
  // Les onglets déjà ouverts au moment de l'installation n'ont pas les content scripts : la page d'options
  // affiche un bandeau « rechargez ces onglets » jusqu'à ce que l'utilisateur le ferme.
  if (details.reason === 'install') chrome.storage.local.set({ reloadHintPending: true });
});
