'use strict';

const { reconcile, defaultLabel, pickVoice, localVoices, labelDerivedFromEmail } = globalThis.WHICHPROFILE_CONFIG;
const { t, localeDefaults, translatePage } = globalThis.WHICHPROFILE_I18N;
const $ = (id) => document.getElementById(id);
const locale = localeDefaults();
const { chipModel, mountChip, TAG: CHIP_TAG } = globalThis.WHICHPROFILE_CHIP;
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

// Aperçu de l'Agent mode : le vrai badge de lib/chip.js, monté tel quel dans #agent-preview.
// La CSP des pages de l'extension (style-src 'self') bloque le <style> que mountChip met dans le shadow root :
// ce « document » le remplace par un <template> inerte et applique la même CSS (model.css) par
// adoptedStyleSheets. Même balisage, même CSS que sur les pages : rendu identique, lib/chip.js intact.
let previewBadge = null;
function previewDocument(model) {
  return {
    createElement(tag) {
      if (tag === 'style') return document.createElement('template');
      const element = document.createElement(tag);
      if (tag === CHIP_TAG) {
        element.attachShadow = (init) => {
          const root = HTMLElement.prototype.attachShadow.call(element, init);
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(model.css);
          root.adoptedStyleSheets = [sheet];
          return root;
        };
      }
      return element;
    },
  };
}

function renderAgentPreview() {
  const model = config.agentMode ? chipModel(config.identity.label) : null;
  $('agent-preview').hidden = !model;
  if (!model) {
    if (previewBadge) previewBadge.remove();
    previewBadge = null;
    return;
  }
  if (!previewBadge) previewBadge = mountChip(previewDocument(model), $('agent-preview'), model, null);
  else previewBadge.update(model);
}

// Bouton Tester : point rouge (.is-playing) le temps de la lecture, et seulement pendant.
async function markPlaying(mode) {
  const button = $('test');
  button.classList.add('is-playing');
  if (mode === 'sound') {
    await new Promise((resolve) => setTimeout(resolve, 700)); // motif < 1 s
  } else {
    const deadline = Date.now() + 10000;
    await new Promise((resolve) => setTimeout(resolve, 150));
    while (Date.now() < deadline && (await new Promise((resolve) => chrome.tts.isSpeaking(resolve)))) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  button.classList.remove('is-playing');
}

function render() {
  const { identity, sources } = config;
  $('label-pill').textContent = identity.label;
  $('email').textContent = identity.email || t('noAccount');
  if (document.activeElement !== $('label')) $('label').value = identity.label;
  for (const radio of document.querySelectorAll('input[name="mode"]')) radio.checked = radio.value === identity.mode;
  $('pattern').value = identity.pattern;
  $('src-gmail-chat').checked = !!sources['gmail-chat'];
  $('src-gmail-mail').checked = !!sources['gmail-mail'];
  $('muted').checked = !!config.muted;
  $('debug').checked = !!config.debug;
  $('agent').checked = !!config.agentMode;
  renderAgentPreview();
  renderVoiceSelects();
  renderMode();
}

function bind() {
  // Message du garde « libellé neutre » à côté du champ : effacé dès que le libellé saisi n'est plus dérivé de l'e-mail.
  function clearLabelHintIfNeutral() {
    const value = $('label').value.trim();
    const candidate = {
      ...config.identity,
      label: value || defaultLabel(config.identity.email, locale),
      labelIsDefault: !value,
    };
    if (!labelDerivedFromEmail(candidate)) $('label-hint').textContent = '';
  }
  $('label').addEventListener('input', clearLabelHintIfNeutral);

  $('label').addEventListener('change', () => {
    clearLabelHintIfNeutral();
    const value = $('label').value.trim();
    // Garde « libellé neutre » après activation : Agent mode actif et libellé dérivé de l'e-mail → refusé,
    // valeur précédente restaurée (le SW coupe aussi le mode en filet si la config y arrive autrement).
    const candidate = {
      ...config.identity,
      label: value || defaultLabel(config.identity.email, locale),
      labelIsDefault: !value,
    };
    if (config.agentMode && labelDerivedFromEmail(candidate)) {
      $('label').value = config.identity.label;
      $('agent-result').textContent = t('agentModeNeedsNeutralLabel');
      $('saved').textContent = t('agentModeNeedsNeutralLabel');
      return;
    }
    writeConfig((c) => {
      c.identity.label = candidate.label;
      c.identity.labelIsDefault = candidate.labelIsDefault;
      $('label').value = c.identity.label;
    });
  });

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
    let granted = false;
    $('agent-result').textContent = '';
    try {
      if (enable) {
        // Garde : le badge affiche le libellé sur chaque page ; il doit être neutre, pas dérivé de l'e-mail.
        // Vérification synchrone, avant la demande de permission (qui doit rester dans le geste utilisateur).
        if (labelDerivedFromEmail(config.identity)) {
          event.target.checked = false;
          $('agent-result').textContent = t('agentModeNeedsNeutralLabel');
          // Le focus fait défiler la page vers le champ libellé : le message doit être lisible à côté de lui.
          $('label-hint').textContent = t('agentModeNeedsNeutralLabel');
          $('label').focus();
          return;
        }
        granted = await chrome.permissions.request(AGENT_PERMISSIONS);
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
      // Permission accordée mais activation échouée : on ne garde pas un accès à tous les sites inutilisé.
      if (enable && granted) chrome.permissions.remove(AGENT_PERMISSIONS).catch(() => {});
    }
  });

  // Garde contre les clics répétés : un seul test à la fois, de l'envoi jusqu'à la fin de la lecture.
  let playing = false;
  $('test').addEventListener('click', async () => {
    if (playing) return;
    playing = true;
    $('test-result').textContent = '…';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'test' });
      if (!result || !result.ok) throw new Error(result ? result.reason : t('noResponse'));
      markPlaying(result.mode)
        .catch(() => {})
        .finally(() => {
          playing = false;
        });
      $('test-result').textContent =
        result.mode === 'sound'
          ? t('testSound', [$('pattern').selectedOptions[0].textContent])
          : t('testSpoken', [result.text]);
    } catch (error) {
      playing = false;
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
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
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
