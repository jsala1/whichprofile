// ISOLATED world, frame principale, tous les sites sauf Gmail (géré par adapters/gmail.js).
// Surveille le compteur "(N)" en tête de document.title et pinge quand il augmente.
(() => {
  'use strict';

  const { parseUnreadCount, createCounterTracker } = globalThis.WHICHPROFILE_PARSE;
  const POLL_MS = 2000;
  const tracker = createCounterTracker();

  function check() {
    if (tracker.update(parseUnreadCount(document.title), Date.now())) {
      try {
        chrome.runtime.sendMessage({ type: 'ping', source: 'title' }).catch(() => {});
      } catch (_) {
        stop();
      }
    }
  }

  // <title> peut être remplacé par l'app : on observe tout <head>.
  const observer = new MutationObserver(check);
  observer.observe(document.head || document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  // Filet : certaines apps modifient le titre sans mutation observable, et la chauffe doit pouvoir expirer.
  const timer = setInterval(check, POLL_MS);

  function stop() {
    observer.disconnect();
    clearInterval(timer);
  }

  check();
})();
