// Traductions (chrome.i18n, _locales/) pour le service worker, les options et le popup.
// Navigateur uniquement : dépend de lib/config.js pour la table locale → langue TTS.
(function (root) {
  'use strict';

  const { ttsLangForLocale } = root.LEQUEL_CONFIG;

  function t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  // Locale réellement utilisée par chrome.i18n (celle de _locales/, pas forcément celle du navigateur).
  function uiLocale() {
    return t('localeCode');
  }

  // Valeurs par défaut propres à la locale, passées à LEQUEL_CONFIG.reconcile.
  function localeDefaults() {
    return { localLabel: t('localLabel'), lang: ttsLangForLocale(uiLocale()) };
  }

  // Remplace le texte des éléments [data-i18n] et l'attribut lang du document.
  function translatePage(doc) {
    doc.documentElement.lang = uiLocale().replace('_', '-');
    for (const el of doc.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  }

  root.LEQUEL_I18N = { t, uiLocale, localeDefaults, translatePage };
})(globalThis);
