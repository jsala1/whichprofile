'use strict';

const { reconcile } = globalThis.LEQUEL_CONFIG;
const $ = (id) => document.getElementById(id);

let config = null;

function formatTime(at) {
  return new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderLastPing(lastPing) {
  if (!lastPing) {
    $('last').textContent = 'aucun';
    return;
  }
  const state = lastPing.announced ? '' : ' (muet)';
  $('last').textContent = `${lastPing.siteLabel} · ${formatTime(lastPing.at)}${state}`;
}

function render() {
  $('label').textContent = config.identity.label;
  $('email').textContent = config.identity.email || 'profil sans compte Google';
  $('muted').checked = !!config.muted;
}

async function init() {
  const response = await chrome.runtime.sendMessage({ type: 'get-config' });
  config = response.config;
  render();
  renderLastPing((await chrome.storage.session.get('lastPing')).lastPing);

  $('muted').addEventListener('change', async () => {
    const { config: stored } = await chrome.storage.local.get('config');
    const next = reconcile(stored, config.identity.email);
    next.muted = $('muted').checked;
    await chrome.storage.local.set({ config: next });
    config = next;
  });

  $('options').addEventListener('click', () => chrome.runtime.openOptionsPage());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.lastPing) renderLastPing(changes.lastPing.newValue);
    if (area === 'local' && changes.config && changes.config.newValue) {
      config = reconcile(changes.config.newValue, config.identity.email);
      render();
    }
  });
}

init().catch((error) => {
  $('label').textContent = 'Erreur';
  $('email').textContent = error.message;
});
