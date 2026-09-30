'use strict';

const { reconcile, defaultLabel, pickVoice, localVoices, labelDerivedFromEmail } = globalThis.WHICHPROFILE_CONFIG;
const { t, localeDefaults, translatePage } = globalThis.WHICHPROFILE_I18N;
const $ = (id) => document.getElementById(id);
const locale = localeDefaults();
// Permissions optionnelles de l'Agent mode (optional_permissions / optional_host_permissions du manifest).
const AGENT_PERMISSIONS = { permissions: ['scripting'], origins: ['<all_urls>'] };

let config = null;
let voices = [];
let savedTimer = null;

async function readConfig() {
  const { config: stored } = await chrome.storage.local.get('config');
  return reconcile(stored, config ? config.identity.email : '', locale);
}

async function writeConfig(mutate) {
  const next = await readConfig();
  mutate(next);
  await chrome.storage.local.set({ config: next });
  config = next;
  $('saved').textContent = t('saved');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => ($('saved').textContent = ''), 1500);
}

function langs() {
  const set = new Set(voices.map((v) => v.lang).filter(Boolean));
  set.add(locale.lang);
  set.add(config.identity.lang);
  // Langue de la locale en tête, puis ordre alphabétique.
  return [...set].sort((a, b) => (a === locale.lang ? -1 : b === locale.lang ? 1 : a.localeCompare(b)));
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
  const options = [new Option(auto ? t('voiceAuto', [auto]) : t('voiceAutoDefault'), '')];
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
  $('email').textContent = identity.email || t('noAccount');
  if (document.activeElement !== $('label')) $('label').value = identity.label;
  for (const radio of document.querySelectorAll('input[name="mode"]')) radio.checked = radio.value === identity.mode;
  $('pattern').value = identity.pattern;
  $('src-gmail-chat').checked = !!sources['gmail-chat'];
  $('src-gmail-mail').checked = !!sources['gmail-mail'];
  $('muted').checked = !!config.muted;
  $('debug').checked = !!config.debug;
  $('agent').checked = !!config.agentMode;
  renderVoiceSelects();
  renderMode();
}

function bind() {
  $('label').addEventListener('change', () =>
    writeConfig((c) => {
      const value = $('label').value.trim();
      c.identity.label = value || defaultLabel(c.identity.email, locale);
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

  // Activation : la demande de permission doit partir du clic (geste utilisateur). Refus = reste désactivé.
  // Désactivation : le service worker retire le script et les permissions.
  $('agent').addEventListener('change', async (event) => {
    const enable = event.target.checked;
    $('agent-result').textContent = '';
    try {
      if (enable) {
        // Garde : le badge affiche le libellé sur chaque page ; il doit être neutre, pas dérivé de l'e-mail.
        // Vérification synchrone, avant la demande de permission (qui doit rester dans le geste utilisateur).
        if (labelDerivedFromEmail(config.identity)) {
          event.target.checked = false;
          $('agent-result').textContent = t('agentModeNeedsNeutralLabel');
          $('label').focus();
          return;
        }
        const granted = await chrome.permissions.request(AGENT_PERMISSIONS);
        if (!granted) {
          event.target.checked = false;
          $('agent-result').textContent = t('agentModeDenied');
          return;
        }
      }
      const result = await chrome.runtime.sendMessage({ type: enable ? 'agent-enable' : 'agent-disable' });
      if (!result || !result.ok) throw new Error(result ? result.reason : t('noResponse'));
    } catch (error) {
      event.target.checked = !enable;
      $('agent-result').textContent = t('testFailed', [error.message]);
    }
  });

  $('test').addEventListener('click', async () => {
    $('test-result').textContent = '…';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'test' });
      if (!result || !result.ok) throw new Error(result ? result.reason : t('noResponse'));
      $('test-result').textContent =
        result.mode === 'sound'
          ? t('testSound', [$('pattern').selectedOptions[0].textContent])
          : t('testSpoken', [result.text]);
    } catch (error) {
      $('test-result').textContent = t('testFailed', [error.message]);
    }
  });

  // Le popup peut changer le mute pendant que la page est ouverte.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.config && changes.config.newValue) {
      config = reconcile(changes.config.newValue, config.identity.email, locale);
      render();
    }
  });
}

async function init() {
  translatePage(document);
  // get-config passe par le SW : il lit l'email du profil et crée la config à la première exécution.
  const response = await chrome.runtime.sendMessage({ type: 'get-config' });
  config = response.config;
  // Voix locales seulement : les voix réseau enverraient le texte annoncé hors de l'appareil.
  voices = localVoices(await chrome.tts.getVoices());
  render();
  bind();
  if (voices.length === 0) waitForVoices();
}

// Les voix du système arrivent quelques secondes après le démarrage de Chrome : on réessaie.
async function waitForVoices(attempt = 0) {
  if (attempt >= 20) return;
  await new Promise((resolve) => setTimeout(resolve, 500));
  voices = localVoices(await chrome.tts.getVoices());
  if (voices.length === 0) return waitForVoices(attempt + 1);
  renderVoiceSelects();
}

init().catch((error) => {
  $('saved').textContent = t('loadError', [error.message]);
});
