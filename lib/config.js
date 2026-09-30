// Configuration : valeurs par défaut, réconciliation avec l'email du profil, règles d'annonce.
// Utilisé par le SW (importScripts), les options, le popup et les tests.
(function (root) {
  'use strict';

  const labelFromEmail =
    typeof module !== 'undefined' && module.exports
      ? require('./parse.js').labelFromEmail
      : root.WHICHPROFILE_PARSE.labelFromEmail;

  const SCHEMA_VERSION = 1;

  // Fenêtre anti-doublon par site. On annonce une identité, pas chaque message : le DOM Gmail puis la
  // notification native du même message arrivent à quelques secondes d'écart (bug T4 du 2026-09-29, 3 s ne suffisaient pas).
  const DEBOUNCE_MS = 12000;

  // Pings gardés pour le popup (diagnostic sans DEBUG).
  const RECENT_PINGS_MAX = 5;
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
      // Agent mode : opt-in, nécessite les permissions optionnelles <all_urls> + scripting.
      agentMode: false,
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

  // Agent mode : le badge affiche le libellé sur chaque page. Il ne doit pas être dérivé de l'e-mail du compte
  // (libellé par défaut non modifié, partie avant « @ », ou adresse complète) : l'activation exige un libellé neutre.
  function labelDerivedFromEmail(identity) {
    if (!identity || !identity.email) return false;
    if (identity.labelIsDefault) return true;
    const label = String(identity.label || '').trim().toLowerCase();
    const email = String(identity.email).trim().toLowerCase();
    return label === email || label === labelFromEmail(email);
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

  // Voix locales uniquement : une voix réseau (remote: true) enverrait le texte annoncé hors de l'appareil.
  function localVoices(voices) {
    return Array.isArray(voices) ? voices.filter((v) => v && v.voiceName && !v.remote) : [];
  }

  // Voix locale : celle choisie si elle existe, sinon la première de la langue exacte, puis du même préfixe (fr-*).
  // '' = aucune voix locale utilisable : l'appelant ne doit pas parler (il joue le motif sonore à la place),
  // car sans voiceName Chrome pourrait choisir une voix réseau.
  function pickVoice(voices, lang, preferredName) {
    const local = localVoices(voices);
    if (local.length === 0) return '';
    if (preferredName && local.some((v) => v.voiceName === preferredName)) return preferredName;
    const exact = local.find((v) => v.lang === lang);
    if (exact) return exact.voiceName;
    const prefix = String(lang || '').split('-')[0];
    const loose = prefix && local.find((v) => typeof v.lang === 'string' && v.lang.split('-')[0] === prefix);
    return loose ? loose.voiceName : '';
  }

  // Ajoute un ping en tête de liste et garde les plus récents. Entrée : { at, site, siteLabel, source, announced, status }.
  function pushRecentPing(list, entry, max = RECENT_PINGS_MAX) {
    return [entry, ...(Array.isArray(list) ? list : [])].slice(0, max);
  }

  function announcementText(siteText, label) {
    return `${siteText}, ${label}`;
  }

  const api = {
    SCHEMA_VERSION,
    DEBOUNCE_MS,
    RECENT_PINGS_MAX,
    pushRecentPing,
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
    labelDerivedFromEmail,
    shouldAnnounce,
    localVoices,
    pickVoice,
    announcementText,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WHICHPROFILE_CONFIG = api;
})(globalThis);
