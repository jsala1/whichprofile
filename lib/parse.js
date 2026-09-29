// Fonctions pures, partagées entre content scripts, service worker et tests Node.
(function (root) {
  'use strict';

  const WARMUP_MS = 10000;

  // "(3) WhatsApp" → 3 ; "WhatsApp" → null ; "Re: (2) truc" → null (le compteur doit être en tête).
  function parseUnreadCount(title) {
    if (typeof title !== 'string') return null;
    const match = /^\s*\((\d+)\+?\)/.exec(title);
    return match ? Number(match[1]) : null;
  }

  // Titre Gmail : "Boîte de réception (12) - x@y - Gmail" → { view: 'Boîte de réception', count: 12 }.
  // Vue sans compteur ("Inbox - x@y - Gmail") → count 0. Titre non Gmail → null.
  // La fin peut être "Gmail" ou "<Organisation> Mail" (Workspace) : on s'ancre sur l'adresse email.
  function parseGmailTitle(title) {
    if (typeof title !== 'string') return null;
    const match = /^(.+?)(?:\s+\((\d[\d.,\s  ]*)\))?\s+-\s+\S+@\S+\s+-\s+\S.*$/.exec(title.trim());
    if (!match) return null;
    const count = match[2] ? Number(match[2].replace(/\D/g, '')) : 0;
    return { view: match[1].trim(), count };
  }

  // Détecte l'augmentation d'un compteur de non-lus.
  // - Avant la référence : la première valeur numérique, ou la fin de la chauffe, fixe la référence sans ping.
  // - Après : null (plus de compteur affiché) vaut 0 ; ping seulement si la valeur augmente.
  function createCounterTracker(options = {}) {
    const warmupMs = options.warmupMs ?? WARMUP_MS;
    let startedAt = null;
    let hasBaseline = false;
    let last = 0;

    return {
      update(count, now = Date.now()) {
        if (startedAt === null) startedAt = now;
        if (!hasBaseline) {
          if (count !== null) {
            hasBaseline = true;
            last = count;
          } else if (now - startedAt >= warmupMs) {
            hasBaseline = true;
            last = 0;
          }
          return false;
        }
        const value = count === null ? 0 : count;
        const increased = value > last;
        last = value;
        return increased;
      },
    };
  }

  // Somme des non-lus lus dans une liste d'aria-labels.
  // countPattern capture un nombre ; flagPattern (sans nombre) compte pour 1 ; excludePattern écarte le libellé.
  function countUnreadInLabels(labels, { countPattern, flagPattern, excludePattern } = {}) {
    let total = 0;
    for (const label of labels) {
      if (typeof label !== 'string' || !label) continue;
      if (excludePattern && excludePattern.test(label)) continue;
      const counted = countPattern && countPattern.exec(label);
      if (counted) total += Number(counted[1]);
      else if (flagPattern && flagPattern.test(label)) total += 1;
    }
    return total;
  }

  function labelFromEmail(email) {
    if (typeof email !== 'string' || !email.includes('@')) return '';
    return email.slice(0, email.indexOf('@'));
  }

  // Debounce en front montant : la première occurrence passe, les suivantes sont ignorées pendant windowMs.
  // load/save sont asynchrones (chrome.storage.session dans le SW) ; les appels sont sérialisés
  // pour que des pings simultanés ne lisent pas tous l'ancien horodatage.
  function createDebouncer({ windowMs, load, save }) {
    let queue = Promise.resolve();
    return {
      hit(key, now = Date.now()) {
        const run = queue.then(async () => {
          const lastAt = await load(key);
          if (typeof lastAt === 'number' && now - lastAt < windowMs) return false;
          await save(key, now);
          return true;
        });
        queue = run.catch(() => {});
        return run;
      },
    };
  }

  const api = {
    WARMUP_MS,
    parseUnreadCount,
    parseGmailTitle,
    createCounterTracker,
    countUnreadInLabels,
    labelFromEmail,
    createDebouncer,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LEQUEL_PARSE = api;
})(globalThis);
