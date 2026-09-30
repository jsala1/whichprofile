'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseUnreadCount,
  parseGmailTitle,
  createCounterTracker,
  countUnreadInLabels,
  labelFromEmail,
  createDebouncer,
  WARMUP_MS,
} = require('../lib/parse.js');

test('parseUnreadCount : compteur en tête de titre uniquement', () => {
  assert.equal(parseUnreadCount('(3) WhatsApp'), 3);
  assert.equal(parseUnreadCount('WhatsApp'), null);
  assert.equal(parseUnreadCount('(12) Inbox - x@y'), 12);
  assert.equal(parseUnreadCount('Re: (2) truc'), null);
  assert.equal(parseUnreadCount('(99+) Feed | LinkedIn'), 99);
  assert.equal(parseUnreadCount(''), null);
  assert.equal(parseUnreadCount(undefined), null);
});

test('parseGmailTitle : format FR réel', () => {
  assert.deepEqual(parseGmailTitle('Boîte de réception (12) - x@y - Gmail'), { view: 'Boîte de réception', count: 12 });
});

test('parseGmailTitle : format EN réel', () => {
  assert.deepEqual(parseGmailTitle('Inbox (12) - x@y - Gmail'), { view: 'Inbox', count: 12 });
});

test('parseGmailTitle : vue sans compteur = 0, Workspace, séparateurs de milliers', () => {
  assert.deepEqual(parseGmailTitle('Inbox - x@y - Gmail'), { view: 'Inbox', count: 0 });
  assert.deepEqual(parseGmailTitle('Inbox (3) - julian@example.com - Serendyme Mail'), { view: 'Inbox', count: 3 });
  assert.deepEqual(parseGmailTitle('Inbox (1,234) - x@y - Gmail'), { view: 'Inbox', count: 1234 });
  assert.deepEqual(parseGmailTitle('Boîte de réception (1 234) - x@y - Gmail'), { view: 'Boîte de réception', count: 1234 });
  assert.deepEqual(parseGmailTitle('Devis - v2 - x@y - Gmail'), { view: 'Devis - v2', count: 0 });
});

test('parseGmailTitle : titre non Gmail → null', () => {
  assert.equal(parseGmailTitle('Gmail'), null);
  assert.equal(parseGmailTitle('(3) WhatsApp'), null);
});

function pingIndexes(sequence, times) {
  const tracker = createCounterTracker();
  const pings = [];
  sequence.forEach((count, i) => {
    if (tracker.update(count, times ? times[i] : 0)) pings.push(i);
  });
  return pings;
}

test('tracker : [null, 1, 1, 2, 0, 1] → pings aux index 3 et 5 seulement', () => {
  assert.deepEqual(pingIndexes([null, 1, 1, 2, 0, 1]), [3, 5]);
});

// Hystérésis en DURÉE (2026-09-30) : un titre sans compteur ne remet à 0 qu'après 6 s continues.
// Les séquences commencent par une lecture 0 : c'est la référence (première lecture, jamais annoncée).
// Lectures toutes les 2 s (rythme du polling) sauf mention contraire.
const every2s = (sequence) => sequence.map((_, i) => i * 2000);

test('hystérésis : [1, ∅ pendant ≥ 6 s, 1] → 2 annonces (tout lu, puis vrai nouveau message)', () => {
  const sequence = [0, 1, null, null, null, null, 1]; // null de 4 s à 10 s : 6 s continues
  assert.deepEqual(pingIndexes(sequence, every2s(sequence)), [1, 6]);
});

test('hystérésis : [0, 1, null, 1, null, 1] → 1 seule annonce (clignotement)', () => {
  const sequence = [0, 0, 1, null, 1, null, 1];
  assert.deepEqual(pingIndexes(sequence, every2s(sequence)), [2]);
});

test('hystérésis : [2, null, 3] → 2 annonces', () => {
  const sequence = [0, 2, null, 3];
  assert.deepEqual(pingIndexes(sequence, every2s(sequence)), [1, 3]);
});

test('hystérésis : [2, null, 1] → 1 seule annonce (un titre sans compteur ne remet pas à 0)', () => {
  const sequence = [0, 2, null, 1];
  assert.deepEqual(pingIndexes(sequence, every2s(sequence)), [1]);
});

test('hystérésis : 50 lectures null en 200 ms → pas de remise à zéro', () => {
  // Le MutationObserver de <head> peut appeler check() des dizaines de fois par seconde.
  const nulls = Array.from({ length: 50 }, () => null);
  const sequence = [0, 1, ...nulls, 1];
  const times = [0, 1000, ...nulls.map((_, i) => 1100 + i * 4), 1400];
  assert.deepEqual(pingIndexes(sequence, times), [1]);
});

test('hystérésis : null continu 6,5 s → remise à zéro, le message suivant est annoncé', () => {
  assert.deepEqual(pingIndexes([0, 1, null, null, 1], [0, 1000, 2000, 8500, 9000]), [1, 4]);
});

test('hystérésis : null pendant 5,9 s seulement → pas de remise à zéro', () => {
  assert.deepEqual(pingIndexes([0, 1, null, null, 1], [0, 1000, 2000, 7900, 8000]), [1]);
});

test('hystérésis : un compteur au milieu interrompt la série de null (la durée repart de zéro)', () => {
  const sequence = [0, 1, null, null, 1, null, null, 1];
  const times = [0, 1000, 2000, 6000, 7000, 8000, 12000, 13000]; // deux séries de 4 s, jamais 6 s continues
  assert.deepEqual(pingIndexes(sequence, times), [1]);
});

function cappedPings(sequence, times) {
  const tracker = createCounterTracker({ capMs: 60000 });
  return sequence.flatMap((count, i) => (tracker.update(count, times[i]) ? [i] : []));
}

test('tracker plafonné (titre) : 0/1 en boucle pendant 60 s → une seule annonce', () => {
  assert.deepEqual(cappedPings([0, 1, 0, 1, 0, 1], [0, 1000, 2000, 3000, 4000, 5000]), [1]);
});

test('tracker plafonné : valeur strictement supérieure au maximum → annonce même dans les 60 s', () => {
  assert.deepEqual(cappedPings([0, 1, 0, 2], [0, 1000, 2000, 3000]), [1, 3]);
});

test('tracker plafonné : après 60 s, une nouvelle augmentation est annoncée', () => {
  assert.deepEqual(cappedPings([0, 1, 0, 1], [0, 1000, 2000, 62000]), [1, 3]);
});

test('tracker plafonné (rythme réel de 2 s) : tout lu ≥ 6 s puis nouveau message dans la minute → annoncé', () => {
  assert.deepEqual(cappedPings([0, 1, null, null, null, null, 1], [0, 2000, 4000, 6000, 8000, 10000, 12000]), [1, 6]);
});

test('tracker plafonné (rythme réel de 2 s) : clignotement null / 1 pendant 60 s → 1 seule annonce', () => {
  const sequence = [0, ...Array.from({ length: 30 }, (_, i) => (i % 2 ? null : 1))];
  const times = sequence.map((_, i) => i * 2000);
  assert.deepEqual(cappedPings(sequence, times), [1]);
});

test('tracker : chauffe écoulée puis (1) → ping', () => {
  // Profil sans non-lus au chargement : le premier message ne doit pas servir de référence.
  assert.deepEqual(pingIndexes([null, null, 1], [0, WARMUP_MS, WARMUP_MS + 2000]), [2]);
});

test('tracker : pendant la chauffe, la première valeur numérique sert de référence (rechargement avec non-lus)', () => {
  assert.deepEqual(pingIndexes([null, 5, 5, 5], [0, 1500, 3000, 20000]), []);
});

test('countUnreadInLabels : nombres, drapeaux et exclusions', () => {
  const patterns = { excludePattern: /inbox|boîte de réception/i };
  assert.equal(
    countUnreadInLabels(
      ['Chat, 3 unread messages', 'Espace Design, non lu', 'Inbox 42 unread', 'Boîte de réception 7 non lus', null],
      patterns,
    ),
    4,
  );
  assert.equal(countUnreadInLabels(['Chat, 2 messages non lus'], patterns), 2); // un mot entre le nombre et "non lus"
});

test('labelFromEmail', () => {
  assert.equal(labelFromEmail('julian@example.com'), 'julian');
  assert.equal(labelFromEmail(''), '');
  assert.equal(labelFromEmail('pas-un-email'), '');
});

function memoryStore() {
  const map = new Map();
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  return {
    load: async (key) => {
      await tick();
      return map.get(key);
    },
    save: async (key, value) => {
      await tick();
      map.set(key, value);
    },
  };
}

test('debounce : 3 pings en 500 ms → 1 action', async () => {
  const debouncer = createDebouncer({ windowMs: 3000, ...memoryStore() });
  const results = await Promise.all([debouncer.hit('web.whatsapp.com', 0), debouncer.hit('web.whatsapp.com', 200), debouncer.hit('web.whatsapp.com', 500)]);
  assert.deepEqual(results, [true, false, false]);
});

test('debounce : par site, et fenêtre expirée → nouvelle action', async () => {
  const debouncer = createDebouncer({ windowMs: 3000, ...memoryStore() });
  assert.equal(await debouncer.hit('mail.google.com', 0), true);
  assert.equal(await debouncer.hit('web.whatsapp.com', 100), true);
  assert.equal(await debouncer.hit('mail.google.com', 2999), false);
  assert.equal(await debouncer.hit('mail.google.com', 3000), true);
});

const { DEBOUNCE_MS } = require('../lib/config.js');

test('fenêtre anti-doublon réelle : 12 s par site', () => {
  assert.equal(DEBOUNCE_MS, 12000);
});

test('debounce 12 s : 2 pings du même site à 5 s d’écart → 1 annonce', async () => {
  const debouncer = createDebouncer({ windowMs: DEBOUNCE_MS, ...memoryStore() });
  assert.deepEqual([await debouncer.hit('mail.google.com', 0), await debouncer.hit('mail.google.com', 5000)], [true, false]);
});

test('debounce 12 s : 2 pings du même site à 15 s d’écart → 2 annonces', async () => {
  const debouncer = createDebouncer({ windowMs: DEBOUNCE_MS, ...memoryStore() });
  assert.deepEqual([await debouncer.hit('mail.google.com', 0), await debouncer.hit('mail.google.com', 15000)], [true, true]);
});

test('bug T4 : DOM chat Gmail puis notification native quelques secondes après → 1 annonce', async () => {
  const debouncer = createDebouncer({ windowMs: DEBOUNCE_MS, ...memoryStore() });
  const domChat = await debouncer.hit('mail.google.com', 0);
  const nativeNotification = await debouncer.hit('mail.google.com', 4500);
  const titleCounter = await debouncer.hit('mail.google.com', 6000);
  assert.deepEqual([domChat, nativeNotification, titleCounter], [true, false, false]);
});

test('debounce 12 s : conversation soutenue → au plus une annonce par 12 s, jamais bloquée', async () => {
  const debouncer = createDebouncer({ windowMs: DEBOUNCE_MS, ...memoryStore() });
  const results = [];
  for (const at of [0, 10000, 20000, 25000, 33000]) results.push(await debouncer.hit('web.whatsapp.com', at));
  // La fenêtre part de la dernière annonce, pas du dernier ping : 20 s passe (20 - 0 ≥ 12), 33 s aussi (33 - 20 ≥ 12).
  assert.deepEqual(results, [true, false, true, false, true]);
});
