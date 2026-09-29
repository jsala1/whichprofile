// Adaptateur Gmail — ISOLATED world, mail.google.com, toutes les frames.
// Deux sources :
//   - gmail-chat : non-lus du chat, lus dans les aria-label (le titre de Gmail ne bouge pas pour le chat) ;
//   - gmail-mail : compteur du titre « Boîte de réception (12) - x@y - Gmail » (frame principale seulement).
// Les toggles (chat ON, mail OFF par défaut) sont appliqués par le service worker.
//
// C'est la partie la plus fragile du projet : Gmail change son DOM sans prévenir.
// Si le chat n'est plus détecté, activer DEBUG dans les options, ouvrir la console de l'onglet Gmail
// (sélecteur de contexte : top et frames /chat/…), et ajuster le bloc SELECTORS ci-dessous. Rien d'autre à toucher.
(function () {
  'use strict';

  // ====================================================================================================
  // SELECTORS — tout ce qui dépend du DOM de Gmail est ici. Jamais de classes obfusquées.
  // ====================================================================================================
  const SELECTORS = {
    // Frames qui hébergent le chat intégré (chemin de l'URL de la frame). Dans ces frames, tout est chat.
    chatFramePath: /^\/chat\//,

    // Frame principale : conteneurs dans lesquels on cherche (nav gauche, rail Mail / Chat / Meet).
    topFrameRoots: '[role="navigation"], [role="complementary"]',

    // Frames chat : conteneur dans lequel on cherche.
    chatFrameRoots: 'body',

    // Éléments dont on lit l'aria-label.
    items: '[aria-label]',

    // Frame principale uniquement : l'aria-label doit parler de chat, sinon c'est du mail.
    // ex. « Chat, 3 unread messages », « Chat, 3 messages non lus », « Espaces, 1 non lu ».
    topFrameChatHint: /\bchat\b|espaces?\b|\bspaces?\b|conversation|discussion|message (privé|direct)|direct message/i,

    // Nombre de non-lus : « 3 unread », « 3 messages non lus », « 1 non lu ».
    unreadCount: /(\d+)\s+(?:\S+\s+)?(?:unread|non[\s-]lus?)/i,

    // Non-lu sans nombre (« Alice, unread », « Design, non lu ») : compte pour 1.
    unreadFlag: /\b(?:unread|non[\s-]lus?)\b/i,

    // Libellés de mail à ne jamais compter comme du chat.
    exclude:
      /boîte de réception|\binbox\b|brouillons?|\bdrafts?\b|\bspam\b|envoyés|\bsent\b|suivis|starred|en attente|snoozed|corbeille|\btrash\b|tous les messages|all mail|importants?\b|catégories|categories|promotions|réseaux sociaux|social|notifications|forums|mises à jour|updates/i,

    // DEBUG : aria-labels journalisés comme candidats (en plus de ceux qui comptent).
    debugCandidates: /unread|non[\s-]lus?|\bchat\b|espace|\bspace|conversation|\d/i,
  };
  // ====================================================================================================

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SELECTORS };
    return;
  }

  const { parseGmailTitle, createCounterTracker, countUnreadInLabels } = globalThis.LEQUEL_PARSE;
  const SCAN_DELAY_MS = 300;
  const POLL_MS = 2000;
  const isTop = window === window.top;
  const isChatFrame = SELECTORS.chatFramePath.test(location.pathname);
  const frameName = isTop ? 'top' : location.pathname.slice(0, 40) || location.href.slice(0, 40);

  let debug = false;
  let alive = true;

  const log = (...args) => {
    if (debug) console.info('%c[Lequel DEBUG gmail]', 'color:#d9822b', `frame=${frameName}`, ...args);
  };

  function ping(source) {
    log('PING', source);
    try {
      chrome.runtime.sendMessage({ type: 'ping', source }).catch(() => {});
    } catch (_) {
      alive = false; // extension rechargée : ce script est orphelin
    }
  }

  // --- Chat ------------------------------------------------------------------------------------------

  const chatTracker = createCounterTracker();
  let lastDebugSnapshot = new Set();

  // Chemin lisible d'un élément par rôles / aria, sans classes.
  function describe(el) {
    const parts = [];
    for (let node = el; node && node !== document.body && parts.length < 4; node = node.parentElement) {
      const role = node.getAttribute('role');
      parts.unshift(node.tagName.toLowerCase() + (role ? `[role=${role}]` : ''));
    }
    return parts.join(' > ');
  }

  function chatLabels() {
    const roots = document.querySelectorAll(isChatFrame ? SELECTORS.chatFrameRoots : SELECTORS.topFrameRoots);
    const found = [];
    for (const root of roots) {
      for (const el of root.querySelectorAll(SELECTORS.items)) {
        const label = el.getAttribute('aria-label');
        if (!label) continue;
        if (!isChatFrame && !SELECTORS.topFrameChatHint.test(label)) continue;
        found.push({ el, label });
      }
    }
    return found;
  }

  function scanChat() {
    const found = chatLabels();
    const total = countUnreadInLabels(
      found.map((f) => f.label),
      { countPattern: SELECTORS.unreadCount, flagPattern: SELECTORS.unreadFlag, excludePattern: SELECTORS.exclude },
    );

    if (debug) debugCandidates(total);
    if (chatTracker.update(total, Date.now())) ping('gmail-chat');
  }

  // En DEBUG, on journalise les aria-labels candidats qui ont changé depuis le dernier scan, avec leur contribution.
  function debugCandidates(total) {
    const roots = document.querySelectorAll(isChatFrame ? SELECTORS.chatFrameRoots : SELECTORS.topFrameRoots);
    const snapshot = new Set();
    const rows = [];
    for (const root of roots) {
      for (const el of root.querySelectorAll(SELECTORS.items)) {
        const label = el.getAttribute('aria-label');
        if (!label || !SELECTORS.debugCandidates.test(label)) continue;
        snapshot.add(label);
        if (lastDebugSnapshot.has(label)) continue;
        const counted = countUnreadInLabels([label], {
          countPattern: SELECTORS.unreadCount,
          flagPattern: SELECTORS.unreadFlag,
          excludePattern: SELECTORS.exclude,
        });
        const chatHint = isChatFrame || SELECTORS.topFrameChatHint.test(label);
        rows.push({ label, compte: chatHint ? counted : `${counted} (ignoré : pas de mot chat)`, chemin: describe(el) });
      }
    }
    lastDebugSnapshot = snapshot;
    if (rows.length) {
      log(`candidats modifiés : ${rows.length} — total chat = ${total}`);
      console.table(rows);
    }
  }

  // --- Mail (titre) ----------------------------------------------------------------------------------

  // Un tracker par vue : changer de libellé ou ouvrir un fil ne doit pas passer pour un nouveau mail.
  const mailTrackers = new Map();
  let lastTitle = null;

  function scanTitle() {
    const title = document.title;
    const parsed = parseGmailTitle(title);
    if (debug && title !== lastTitle) log('titre', parsed ? `vue="${parsed.view}" compteur=${parsed.count}` : 'non reconnu');
    lastTitle = title;
    if (!parsed) return;
    if (!mailTrackers.has(parsed.view)) mailTrackers.set(parsed.view, createCounterTracker());
    if (mailTrackers.get(parsed.view).update(parsed.count, Date.now())) ping('gmail-mail');
  }

  // --- Boucle ----------------------------------------------------------------------------------------

  let scheduled = null;
  function schedule() {
    if (scheduled || !alive) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      run();
    }, SCAN_DELAY_MS);
  }

  function run() {
    if (!alive) return stop();
    scanChat();
    if (isTop) scanTitle();
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label'],
  });
  const timer = setInterval(run, POLL_MS);

  function stop() {
    observer.disconnect();
    clearInterval(timer);
  }

  function applyConfig(config) {
    const next = !!(config && config.debug);
    if (next && !debug) lastDebugSnapshot = new Set();
    debug = next;
    if (debug) log(`adaptateur actif (${isChatFrame ? 'frame chat' : isTop ? 'frame principale' : 'autre frame'})`, location.href);
  }

  chrome.storage.local.get('config').then(({ config }) => applyConfig(config), () => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.config) applyConfig(changes.config.newValue);
  });

  run();
})();
