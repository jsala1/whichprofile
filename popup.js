'use strict';

const { reconcile } = globalThis.WHICHPROFILE_CONFIG;
const { t, uiLocale, localeDefaults, translatePage } = globalThis.WHICHPROFILE_I18N;
const $ = (id) => document.getElementById(id);
const locale = localeDefaults();

let config = null;

function formatTime(at) {
  return new Date(at).toLocaleTimeString(uiLocale().replace('_', '-'), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const STATUS_KEYS = {
  announced: 'statusAnnounced',
  muted: 'statusMuted',
  debounced: 'statusDebounced',
  'source-disabled': 'statusSourceOff',
};

// 5 derniers pings : heure, site, source, annoncé ou non (et pourquoi).
function renderPings(pings) {
  const list = $('pings');
  if (!Array.isArray(pings) || pings.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = t('recentPingsNone');
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(
    ...pings.map((ping) => {
      const item = document.createElement('li');
      item.className = ping.announced ? 'ping announced' : 'ping';
      const head = document.createElement('span');
      head.textContent = `${formatTime(ping.at)} · ${ping.siteLabel} · ${ping.source}`;
      const status = document.createElement('span');
      status.className = 'status';
      status.textContent = `${ping.announced ? '✓' : '✗'} ${t(STATUS_KEYS[ping.status] || 'statusMuted')}`;
      item.append(head, status);
      return item;
    }),
  );
}

// Ligne 2 : dernier ping annoncé, s'il existe.
function renderLastEvent(pings) {
  const last = Array.isArray(pings) ? pings.find((ping) => ping.announced) : null;
  $('last-event').hidden = !last;
  if (last) $('last-event').textContent = `${t('statusAnnounced')} · ${last.siteLabel} · ${formatTime(last.at)}`;
}

function render() {
  $('label').textContent = config.identity.label;
  $('email').textContent = config.identity.email || t('noAccountShort');
  $('muted').checked = !!config.muted;
  $('state-mode').textContent = config.identity.mode === 'sound' ? t('modeSound') : t('modeVoice');
  document.body.classList.toggle('is-muted', !!config.muted);
}

// Bouton Tester : même chemin que les options ; point rouge le temps de la lecture.
async function test() {
  const button = $('test');
  button.classList.add('is-playing');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'test' });
    if (result && result.ok && result.mode !== 'sound') {
      const deadline = Date.now() + 10000;
      await new Promise((resolve) => setTimeout(resolve, 150));
      while (Date.now() < deadline && (await new Promise((resolve) => chrome.tts.isSpeaking(resolve)))) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 700)); // motif < 1 s
    }
  } finally {
    button.classList.remove('is-playing');
  }
}

async function init() {
  translatePage(document);
  const response = await chrome.runtime.sendMessage({ type: 'get-config' });
  config = response.config;
  render();
  const { recentPings } = await chrome.storage.session.get('recentPings');
  renderPings(recentPings);
  renderLastEvent(recentPings);

  $('muted').addEventListener('change', async () => {
    const { config: stored } = await chrome.storage.local.get('config');
    const next = reconcile(stored, config.identity.email, locale);
    next.muted = $('muted').checked;
    await chrome.storage.local.set({ config: next });
    config = next;
  });

  $('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('test').addEventListener('click', test);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.recentPings) {
      renderPings(changes.recentPings.newValue);
      renderLastEvent(changes.recentPings.newValue);
    }
    if (area === 'local' && changes.config && changes.config.newValue) {
      config = reconcile(changes.config.newValue, config.identity.email, locale);
      render();
    }
  });
}

init().catch((error) => {
  $('label').textContent = t('error');
  $('email').textContent = error.message;
});
