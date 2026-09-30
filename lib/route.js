// Routage des messages reçus par le service worker : fonction pure, testée sous Node.
// → le nom de l'action à exécuter, ou null (message ignoré).
(function (root) {
  'use strict';

  // Sources de ping acceptées ; toute autre valeur est ignorée.
  const PING_SOURCES = ['notification', 'title', 'gmail-chat', 'gmail-mail'];

  // Messages des pages de l'extension (options, popup) : leur URL commence par l'origine de l'extension.
  const FROM_EXTENSION_PAGE = ['test', 'get-config', 'agent-enable', 'agent-disable'];
  // Messages des content scripts : jamais depuis une page de l'extension, toujours depuis un onglet.
  const FROM_TAB = ['ping', 'agent-state', 'agent-hide'];

  function route(message, sender, extensionOrigin) {
    if (!message || typeof message !== 'object' || message.target === 'offscreen') return null;
    const type = message.type;
    const fromExtensionPage =
      !!sender && typeof sender.url === 'string' && typeof extensionOrigin === 'string' && sender.url.startsWith(extensionOrigin);

    if (FROM_EXTENSION_PAGE.includes(type)) return fromExtensionPage ? type : null;
    if (FROM_TAB.includes(type)) {
      if (fromExtensionPage || !sender || !sender.tab) return null;
      if (type === 'ping' && !PING_SOURCES.includes(message.source)) return null;
      return type;
    }
    return null;
  }

  const api = { PING_SOURCES, route };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WHICHPROFILE_ROUTE = api;
})(globalThis);
