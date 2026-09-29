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
  // Repli hors navigateur (tests) ; dans l'extension, le libellé vient de _locales (message localLabel).
  const LOCAL_LABEL = 'profile without account';

  // Locale de l'interface (noms de dossiers _locales/) → langue TTS par défaut. Le select « Voix » prime toujours.
  const DEFAULT_TTS_LANG = {
    en: 'en-US',
    fr: 'fr-FR',
    es: 'es-ES',
    pt_BR: 'pt-BR',
    pt_PT: 'pt-PT',
    it: 'it-IT',
    de: 'de-DE',
    nl: 'nl-NL',
  };
  const FALLBACK_TTS_LANG = 'en-US';

  // "pt-BR" / "pt_BR" → pt-BR ; "fr-CA" → fr-FR (langue de base) ; "pt" → pt-BR (première variante) ; inconnu → en-US.
  function ttsLangForLocale(uiLocale) {
    const normalized = String(uiLocale || '').replace('-', '_');
    if (DEFAULT_TTS_LANG[normalized]) return DEFAULT_TTS_LANG[normalized];
    const base = normalized.split('_')[0].toLowerCase();
    if (DEFAULT_TTS_LANG[base]) return DEFAULT_TTS_LANG[base];
    const variant = Object.keys(DEFAULT_TTS_LANG).find((key) => key.split('_')[0] === base);
    return variant ? DEFAULT_TTS_LANG[variant] : FALLBACK_TTS_LANG;
  }
  const PATTERNS = ['ding', 'double', 'triple', 'low', 'high'];
  const MODES = ['voice', 'sound'];

  // Sources togglables. Les sources génériques (notification, title) sont toujours actives.
  const DEFAULT_SOURCES = { 'gmail-chat': true, 'gmail-mail': false };

  // locale = { localLabel, lang } : libellé « profil sans compte » et langue TTS de la locale de l'interface.
  function defaultLabel(email, locale = {}) {
    return email ? labelFromEmail(email) || email : locale.localLabel || LOCAL_LABEL;
  }

  function defaultConfig(email = '', locale = {}) {
    return {
      schemaVersion: SCHEMA_VERSION,
      muted: false,
      debug: false,
      sources: { ...DEFAULT_SOURCES },
      identity: {
        id: email || LOCAL_ID,
        email,
        label: defaultLabel(email, locale),
        labelIsDefault: true,
        mode: 'voice',
        pattern: 'ding',
        lang: locale.lang || FALLBACK_TTS_LANG,
        voiceName: '',
      },
    };
  }

  // Complète une config stockée avec les valeurs par défaut et suit l'email du profil.
  // Le libellé n'est recalculé que s'il n'a jamais été modifié par l'utilisateur.
  function reconcile(stored, email = '', locale = {}) {
    const base = defaultConfig(email, locale);
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
      if (identity.labelIsDefault) identity.label = defaultLabel(email, locale);
    }
    if (!MODES.includes(identity.mode)) identity.mode = base.identity.mode;
    if (!PATTERNS.includes(identity.pattern)) identity.pattern = base.identity.pattern;
    if (!identity.label || !String(identity.label).trim()) {
      identity.label = defaultLabel(email, locale);
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
    DEFAULT_TTS_LANG,
    FALLBACK_TTS_LANG,
    ttsLangForLocale,
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
