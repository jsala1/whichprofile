// ISOLATED world, document_start, toutes les frames.
// Relaie l'événement du hook MAIN vers le service worker. Aucun contenu : le SW déduit le site de sender.origin.
(() => {
  'use strict';

  document.addEventListener('whichprofile:notif', () => {
    try {
      chrome.runtime.sendMessage({ type: 'ping', source: 'notification' }).catch(() => {});
    } catch (_) {
      // Contexte d'extension invalidé (extension rechargée) : rien à faire, l'onglet sera réinjecté au rechargement.
    }
  });
})();
