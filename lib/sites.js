// Liste fermée des sites surveillés : hostname → libellé parlé.
// Toute modification ici doit être reportée dans manifest.json (test/sites.test.js le vérifie).
(function (root) {
  'use strict';

  const SITES = {
    'mail.google.com': 'Gmail',
    'chat.google.com': 'Google Chat',
    'web.whatsapp.com': 'WhatsApp',
    'www.messenger.com': 'Messenger',
    'www.facebook.com': 'Facebook',
    'www.instagram.com': 'Instagram',
    'www.linkedin.com': 'LinkedIn',
    'app.slack.com': 'Slack',
    'discord.com': 'Discord',
    'x.com': 'X',
    'outlook.office.com': 'Outlook',
    'outlook.live.com': 'Outlook',
    'teams.microsoft.com': 'Teams',
    'teams.live.com': 'Teams',
    'teams.cloud.microsoft': 'Teams',
  };

  const HOSTS = Object.keys(SITES);

  function isKnownHost(hostname) {
    return Object.prototype.hasOwnProperty.call(SITES, hostname);
  }

  function siteLabel(hostname) {
    return isKnownHost(hostname) ? SITES[hostname] : hostname;
  }

  function matchPatterns() {
    return HOSTS.map((host) => `https://${host}/*`);
  }

  const api = { SITES, HOSTS, isKnownHost, siteLabel, matchPatterns };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WHICHPROFILE_SITES = api;
})(globalThis);
