// Fonctions pures, partagées entre content scripts, service worker et tests Node.
(function (root) {
  'use strict';

  const WARMUP_MS = 10000;
  // Hystérésis du titre : lectures sans compteur consécutives avant de considérer que tout est lu (≈ 6 s à 2 s).
  const NULL_RESET_READS = 3;

  // Mots « non lu » par langue d'interface, avec les variantes de genre et de nombre.
  // Le compteur reste le nombre ; le mot sert de confirmation. Espace = espace, insécable ou tiret.
  // Ajouter une langue : ajouter une ligne ici (la clé suit les noms de dossiers de _locales/).
  const UNREAD_WORDS = {
    en: ['unread'],
    fr: ['non lu', 'non lue', 'non lus', 'non lues'],
    es: ['no leído', 'no leída', 'no leídos', 'no leídas', 'sin leer'],
    pt_BR: ['não lido', 'não lida', 'não lidos', 'não lidas'],
    pt_PT: ['não lido', 'não lida', 'não lidos', 'não lidas', 'por ler'],
    it: ['non letto', 'non letta', 'non letti', 'non lette', 'da leggere'],
    de: ['ungelesen', 'ungelesene', 'ungelesenen', 'ungelesener', 'ungelesenes'],
    nl: ['ongelezen'],
  };

  // Distance max (en caractères) entre le nombre et le mot : « 3 mensagens não lidas » = 11.
  const MAX_NUMBER_DISTANCE = 15;

  function buildUnreadPattern(table) {
    const words = [...new Set(Object.values(table).flat())]
      .sort((a, b) => b.length - a.length)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s\\u00a0-]+'));
    // Bornes Unicode : \b ne connaît pas les lettres accentuées.
    return new RegExp(`(?<!\\p{L})(?:${words.join('|')})(?!\\p{L})`, 'iu');
  }

  const UNREAD_PATTERN = buildUnreadPattern(UNREAD_WORDS);

  // Cherche un mot « non lu » et le nombre le plus proche.
  // → null si aucun mot ; sinon { count } avec count = nombre proche, ou null si aucun nombre assez près.
  function findUnread(text, pattern = UNREAD_PATTERN) {
    if (typeof text !== 'string' || !text) return null;
    const match = pattern.exec(text);
    if (!match) return null;
    const start = match.index;
    const end = match.index + match[0].length;
    let best = null;
    let bestDistance = Infinity;
    for (const number of text.matchAll(/\d+/g)) {
      const numberEnd = number.index + number[0].length;
      const distance = numberEnd <= start ? start - numberEnd : number.index >= end ? number.index - end : 0;
      if (distance < bestDistance) {
        best = Number(number[0]);
        bestDistance = distance;
      }
    }
    return { count: bestDistance <= MAX_NUMBER_DISTANCE ? best : null };
  }

  // "(3) WhatsApp" → 3 ; "WhatsApp" → null ; "Re: (2) truc" → null (le compteur "(N)" doit être en tête).
  // Repli : un nombre accolé à un mot « non lu » (« Outlook – 3 non lus ») ; le mot seul ne suffit pas.
  function parseUnreadCount(title) {
    if (typeof title !== 'string') return null;
    const match = /^\s*\((\d+)\+?\)/.exec(title);
    if (match) return Number(match[1]);
    const unread = findUnread(title);
    return unread ? unread.count : null;
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
  // - Avant la référence : la première valeur numérique, ou la fin de la chauffe (null jusque-là = 0), fixe la
  //   référence sans ping.
  // - Après : hystérésis. Un titre sans compteur (null) ne remet PAS `last` à 0 tout de suite : il faut
  //   nullResetReads lectures null consécutives pour considérer que tout est lu (last = 0). Un clignotement
  //   (null, 1, null, 1…) n'atteint jamais ce seuil : aucune annonce en boucle (audit 2026-09-30).
  // - Ping seulement si la valeur augmente.
  // - capMs (plafond, filet) : dans les capMs qui suivent un ping, un nouveau ping exige une valeur strictement
  //   supérieure au maximum vu depuis ce ping. 0 = pas de plafond. Un « tout est lu » confirmé par l'hystérésis
  //   remet ce maximum à 0 : un vrai nouveau message après lecture est annoncé même dans la minute.
  function createCounterTracker(options = {}) {
    const warmupMs = options.warmupMs ?? WARMUP_MS;
    const capMs = options.capMs ?? 0;
    const nullResetReads = options.nullResetReads ?? NULL_RESET_READS;
    let startedAt = null;
    let nullStreak = 0;
    let hasBaseline = false;
    let last = 0;
    let lastPingAt = null;
    let maxSincePing = 0;

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
        if (count === null) {
          nullStreak += 1;
          if (nullStreak >= nullResetReads) {
            last = 0; // tout est lu, confirmé
            maxSincePing = 0;
          }
          return false;
        }
        nullStreak = 0;
        const increased = count > last;
        last = count;
        const capped = capMs > 0 && lastPingAt !== null && now - lastPingAt < capMs && count <= maxSincePing;
        maxSincePing = Math.max(maxSincePing, count);
        if (!increased || capped) return false;
        lastPingAt = now;
        maxSincePing = count;
        return true;
      },
    };
  }

  // Somme des non-lus lus dans une liste d'aria-labels : le nombre proche du mot « non lu »,
  // ou 1 si le mot est là sans nombre. excludePattern écarte le libellé (compteurs du mail).
  function countUnreadInLabels(labels, { unreadPattern = UNREAD_PATTERN, excludePattern } = {}) {
    let total = 0;
    for (const label of labels) {
      if (typeof label !== 'string' || !label) continue;
      if (excludePattern && excludePattern.test(label)) continue;
      const unread = findUnread(label, unreadPattern);
      if (unread) total += unread.count ?? 1;
    }
    return total;
  }

  // Empreinte courte et stable d'une chaîne (FNV-1a 32 bits, hex) : sert de clé sans garder le texte.
  function hashString(text) {
    let hash = 0x811c9dc5;
    for (const char of String(text)) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
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
    NULL_RESET_READS,
    UNREAD_WORDS,
    UNREAD_PATTERN,
    buildUnreadPattern,
    findUnread,
    parseUnreadCount,
    parseGmailTitle,
    createCounterTracker,
    countUnreadInLabels,
    labelFromEmail,
    hashString,
    createDebouncer,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WHICHPROFILE_PARSE = api;
})(globalThis);
