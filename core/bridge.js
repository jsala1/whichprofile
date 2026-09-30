// ISOLATED world, document_start, toutes les frames.
// Relaie l'événement du hook MAIN vers le service worker. Aucun contenu : le SW déduit le site de sender.origin.
(() => {
  'use strict';

  // Throttle d'entrée : un événement à moins de 500 ms du précédent est ignoré.
  const MIN_INTERVAL_MS = 500;
  let lastAt = -Infinity;

  document.addEventListener('whichprofile:notif', () => {
    const now = Date.now();
    if (now - lastAt < MIN_INTERVAL_MS) return;
    lastAt = now;
    try {
      chrome.runtime.sendMessage({ type: 'ping', source: 'notification' }).catch(() => {});
    } catch (_) {
      // Contexte d'extension invalidé (extension rechargée) : rien à faire, l'onglet sera réinjecté au rechargement.
    }
  });
})();
