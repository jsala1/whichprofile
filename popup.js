'use strict';

const { reconcile } = globalThis.LEQUEL_CONFIG;
const { t, uiLocale, localeDefaults, translatePage } = globalThis.LEQUEL_I18N;
const $ = (id) => document.getElementById(id);
const locale = localeDefaults();

let config = null;

function formatTime(at) {
  return new Date(at).toLocaleTimeString(uiLocale().replace('_', '-'), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderLastPing(lastPing) {
  if (!lastPing) {
    $('last').textContent = t('lastPingNone');
    return;
  }
  const state = lastPing.announced ? '' : ` ${t('lastPingMuted')}`;
  $('last').textContent = `${lastPing.siteLabel} · ${formatTime(lastPing.at)}${state}`;
}

function render() {
  $('label').textContent = config.identity.label;
  $('email').textContent = config.identity.email || t('noAccountShort');
  $('muted').checked = !!config.muted;
}

async function init() {
  translatePage(document);
  const response = await chrome.runtime.sendMessage({ type: 'get-config' });
  config = response.config;
  render();
  renderLastPing((await chrome.storage.session.get('lastPing')).lastPing);

  $('muted').addEventListener('change', async () => {
    const { config: stored } = await chrome.storage.local.get('config');
    const next = reconcile(stored, config.identity.email, locale);
    next.muted = $('muted').checked;
    await chrome.storage.local.set({ config: next });
    config = next;
  });

  $('options').addEventListener('click', () => chrome.runtime.openOptionsPage());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.lastPing) renderLastPing(changes.lastPing.newValue);
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
