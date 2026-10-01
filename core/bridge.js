// ISOLATED world, document_start, toutes les frames.
// Relaie l'événement du hook MAIN vers le service worker. Aucun contenu : le SW déduit le site de sender.origin.
(() => {
  'use strict';

  // Garde anti-double exécution (injection du manifest + réinjection sur le même document). Drapeau dans le
  // monde isolé de l'extension uniquement : rien dans le monde de la page.
  if (globalThis.__whichprofileBridge) return;
  globalThis.__whichprofileBridge = true;

  // Throttle d'entrée : un événement à moins de 500 ms du précédent est ignoré.
  const MIN_INTERVAL_MS = 500;
  let lastAt = -Infinity;

  function onNotification() {
    const now = Date.now();
    if (now - lastAt < MIN_INTERVAL_MS) return;
    lastAt = now;
    try {
      chrome.runtime.sendMessage({ type: 'ping', source: 'notification' }).catch(() => {});
    } catch (_) {
      // Contexte d'extension invalidé (extension mise à jour ou rechargée) : ce script est orphelin, il se
      // désinscrit ; la nouvelle version a réinjecté son propre bridge.
      document.removeEventListener('whichprofile:notif', onNotification);
    }
  }

  document.addEventListener('whichprofile:notif', onNotification);
})();
