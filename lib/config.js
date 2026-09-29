// Configuration : valeurs par défaut, réconciliation avec l'email du profil, règles d'annonce.
// Utilisé par le SW (importScripts), les options, le popup et les tests.
(function (root) {
  'use strict';

  const labelFromEmail =
    typeof module !== 'undefined' && module.exports
      ? require('./parse.js').labelFromEmail
      : root.LEQUEL_PARSE.labelFromEmail;

  const SCHEMA_VERSION = 1;
  const LOCAL_ID = 'local';
  const LOCAL_LABEL = 'profil sans compte';
  const PATTERNS = ['ding', 'double', 'triple', 'low', 'high'];
  const MODES = ['voice', 'sound'];

  // Sources togglables. Les sources génériques (notification, title) sont toujours actives.
  const DEFAULT_SOURCES = { 'gmail-chat': true, 'gmail-mail': false };

  function defaultLabel(email) {
    return email ? labelFromEmail(email) || email : LOCAL_LABEL;
  }

  function defaultConfig(email = '') {
    return {
      schemaVersion: SCHEMA_VERSION,
      muted: false,
      debug: false,
      sources: { ...DEFAULT_SOURCES },
      identity: {
        id: email || LOCAL_ID,
        email,
        label: defaultLabel(email),
        labelIsDefault: true,
        mode: 'voice',
        pattern: 'ding',
        lang: 'fr-FR',
        voiceName: '',
      },
    };
  }

  // Complète une config stockée avec les valeurs par défaut et suit l'email du profil.
  // Le libellé n'est recalculé que s'il n'a jamais été modifié par l'utilisateur.
  function reconcile(stored, email = '') {
    const base = defaultConfig(email);
    if (!stored || typeof stored !== 'object') return base;
    const config = {
      ...base,
      ...stored,
      schemaVersion: SCHEMA_VERSION,
      sources: { ...base.sources, ...(stored.sources || {}) },
      identity: { ...base.identity, ...(stored.identity || {}) },
    };
    const identity = config.identity;
    if (identity.email !== email) {
      identity.email = email;
      identity.id = email || LOCAL_ID;
      if (identity.labelIsDefault) identity.label = defaultLabel(email);
    }
    if (!MODES.includes(identity.mode)) identity.mode = base.identity.mode;
    if (!PATTERNS.includes(identity.pattern)) identity.pattern = base.identity.pattern;
    if (!identity.label || !String(identity.label).trim()) {
      identity.label = defaultLabel(email);
      identity.labelIsDefault = true;
    }
    return config;
  }

  function isSourceEnabled(config, source) {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_SOURCES, source)) {
      return config.sources?.[source] ?? DEFAULT_SOURCES[source];
    }
    return true;
  }

  // Point d'extension unique pour la v2 (plages horaires, partage d'écran).
  // eslint-disable-next-line no-unused-vars
  function shouldAnnounce(config, now) {
    return !config.muted;
  }

  // Voix : celle choisie si elle existe, sinon la première de la langue exacte, puis du même préfixe (fr-*).
  // Liste vide = voix du système pas encore chargées (≈ 2 s après le démarrage de Chrome sous macOS) :
  // on fait confiance au choix enregistré, sinon Chrome choisit d'après lang.
  function pickVoice(voices, lang, preferredName) {
    if (!Array.isArray(voices) || voices.length === 0) return preferredName || '';
    if (preferredName && voices.some((v) => v.voiceName === preferredName)) return preferredName;
    const exact = voices.find((v) => v.lang === lang);
    if (exact) return exact.voiceName;
    const prefix = String(lang || '').split('-')[0];
    const loose = prefix && voices.find((v) => typeof v.lang === 'string' && v.lang.split('-')[0] === prefix);
    return loose ? loose.voiceName : '';
  }

  function announcementText(siteText, label) {
    return `${siteText}, ${label}`;
  }

  const api = {
    SCHEMA_VERSION,
    LOCAL_ID,
    LOCAL_LABEL,
    PATTERNS,
    MODES,
    DEFAULT_SOURCES,
    defaultLabel,
    defaultConfig,
    reconcile,
    isSourceEnabled,
    shouldAnnounce,
    pickVoice,
    announcementText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LEQUEL_CONFIG = api;
})(globalThis);
