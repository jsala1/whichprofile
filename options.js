'use strict';

const { reconcile, defaultLabel, pickVoice } = globalThis.LEQUEL_CONFIG;
const $ = (id) => document.getElementById(id);

let config = null;
let voices = [];
let savedTimer = null;

async function readConfig() {
  const { config: stored } = await chrome.storage.local.get('config');
  return reconcile(stored, config ? config.identity.email : '');
}

async function writeConfig(mutate) {
  const next = await readConfig();
  mutate(next);
  await chrome.storage.local.set({ config: next });
  config = next;
  $('saved').textContent = 'Enregistré';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => ($('saved').textContent = ''), 1500);
}

function langs() {
  const set = new Set(voices.map((v) => v.lang).filter(Boolean));
  set.add('fr-FR');
  set.add(config.identity.lang);
  return [...set].sort((a, b) => (a === 'fr-FR' ? -1 : b === 'fr-FR' ? 1 : a.localeCompare(b)));
}

function voicesFor(lang) {
  const prefix = lang.split('-')[0];
  const exact = voices.filter((v) => v.lang === lang);
  return exact.length ? exact : voices.filter((v) => (v.lang || '').split('-')[0] === prefix);
}

function renderVoiceSelects() {
  const { lang, voiceName } = config.identity;

  $('lang').replaceChildren(...langs().map((code) => new Option(code, code, false, code === lang)));

  const auto = pickVoice(voices, lang, '');
  const options = [new Option(auto ? `Automatique (${auto})` : 'Automatique (voix par défaut)', '')];
  for (const voice of voicesFor(lang)) options.push(new Option(voice.voiceName, voice.voiceName));
  $('voice').replaceChildren(...options);
  $('voice').value = voicesFor(lang).some((v) => v.voiceName === voiceName) ? voiceName : '';
}

function renderMode() {
  const mode = config.identity.mode;
  for (const el of document.querySelectorAll('[data-mode]')) el.hidden = el.dataset.mode !== mode;
}

function render() {
  const { identity, sources } = config;
  $('email').textContent = identity.email || 'aucun compte Google connecté à ce profil Chrome';
  if (document.activeElement !== $('label')) $('label').value = identity.label;
  for (const radio of document.querySelectorAll('input[name="mode"]')) radio.checked = radio.value === identity.mode;
  $('pattern').value = identity.pattern;
  $('src-gmail-chat').checked = !!sources['gmail-chat'];
  $('src-gmail-mail').checked = !!sources['gmail-mail'];
  $('muted').checked = !!config.muted;
  $('debug').checked = !!config.debug;
  renderVoiceSelects();
  renderMode();
}

function bind() {
  $('label').addEventListener('change', () =>
    writeConfig((c) => {
      const value = $('label').value.trim();
      c.identity.label = value || defaultLabel(c.identity.email);
      c.identity.labelIsDefault = !value;
      $('label').value = c.identity.label;
    }),
  );

  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', () =>
      writeConfig((c) => {
        c.identity.mode = radio.value;
      }).then(renderMode),
    );
  }

  $('pattern').addEventListener('change', () => writeConfig((c) => (c.identity.pattern = $('pattern').value)));

  $('lang').addEventListener('change', () =>
    writeConfig((c) => {
      c.identity.lang = $('lang').value;
      c.identity.voiceName = '';
    }).then(renderVoiceSelects),
  );

  $('voice').addEventListener('change', () => writeConfig((c) => (c.identity.voiceName = $('voice').value)));

  for (const source of ['gmail-chat', 'gmail-mail']) {
    $(`src-${source}`).addEventListener('change', (event) =>
      writeConfig((c) => (c.sources[source] = event.target.checked)),
    );
  }

  $('muted').addEventListener('change', () => writeConfig((c) => (c.muted = $('muted').checked)));
  $('debug').addEventListener('change', () => writeConfig((c) => (c.debug = $('debug').checked)));

  $('test').addEventListener('click', async () => {
    $('test-result').textContent = '…';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'test' });
      if (!result || !result.ok) throw new Error(result ? result.reason : 'pas de réponse');
      $('test-result').textContent =
        result.mode === 'sound' ? `Motif « ${config.identity.pattern} » joué.` : `Annoncé : « ${result.text} »`;
    } catch (error) {
      $('test-result').textContent = `Échec : ${error.message}`;
    }
  });

  // Le popup peut changer le mute pendant que la page est ouverte.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.config && changes.config.newValue) {
      config = reconcile(changes.config.newValue, config.identity.email);
      render();
    }
  });
}

async function init() {
  // get-config passe par le SW : il lit l'email du profil et crée la config à la première exécution.
  const response = await chrome.runtime.sendMessage({ type: 'get-config' });
  config = response.config;
  voices = await chrome.tts.getVoices();
  render();
  bind();
  if (voices.length === 0) waitForVoices();
}

// Les voix du système arrivent quelques secondes après le démarrage de Chrome : on réessaie.
async function waitForVoices(attempt = 0) {
  if (attempt >= 20) return;
  await new Promise((resolve) => setTimeout(resolve, 500));
  voices = await chrome.tts.getVoices();
  if (voices.length === 0) return waitForVoices(attempt + 1);
  renderVoiceSelects();
}

init().catch((error) => {
  $('saved').textContent = `Erreur de chargement : ${error.message}`;
});
