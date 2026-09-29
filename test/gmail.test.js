'use strict';

// Vérifie les motifs par défaut du bloc SELECTORS sur des aria-labels plausibles.
// Ce test ne prouve pas que Gmail utilise ces libellés : seul T9 (DEBUG dans le vrai Gmail) le peut.
const test = require('node:test');
const assert = require('node:assert/strict');
const { SELECTORS } = require('../adapters/gmail.js');
const { countUnreadInLabels } = require('../lib/parse.js');

const patterns = { unreadPattern: SELECTORS.unreadWords, excludePattern: SELECTORS.exclude };

// Reproduit le filtre de la frame principale : mot « chat » requis, puis comptage.
const topFrameCount = (labels) => countUnreadInLabels(labels.filter((l) => SELECTORS.topFrameChatHint.test(l)), patterns);

test('frame principale : badge du chat compté, FR et EN', () => {
  assert.equal(topFrameCount(['Chat, 3 unread messages']), 3);
  assert.equal(topFrameCount(['Chat, 3 messages non lus']), 3);
  assert.equal(topFrameCount(['Espaces, 1 non lu']), 1);
});

test('frame principale : compteurs du mail ignorés', () => {
  assert.equal(topFrameCount(['Inbox 42 unread', 'Boîte de réception 12 non lus', 'Mail, 42 unread messages']), 0);
  assert.equal(topFrameCount(['Promotions, 7 non lus', 'Brouillons 2']), 0);
});

test('frame chat : conversations non lues avec et sans nombre', () => {
  assert.equal(countUnreadInLabels(['Alice Martin, unread', 'Design, 2 unread messages', 'Bob, lu'], patterns), 3);
});

test('chemin des frames chat', () => {
  assert.ok(SELECTORS.chatFramePath.test('/chat/u/0/frame'));
  assert.ok(!SELECTORS.chatFramePath.test('/mail/u/0/'));
});
