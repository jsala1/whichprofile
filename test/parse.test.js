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
  assert.deepEqual(parseGmailTitle('Inbox (3) - julian@serendyme.com - Serendyme Mail'), { view: 'Inbox', count: 3 });
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

test('tracker : null après référence puis (1) → ping', () => {
  // Tout est lu, le titre perd son compteur, puis un nouveau message arrive.
  assert.deepEqual(pingIndexes([2, null, 1]), [2]);
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
  assert.equal(labelFromEmail('julian@serendyme.com'), 'julian');
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
