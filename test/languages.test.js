'use strict';

// Détection par langue : aria-label Gmail réaliste (badge chat, conversation non lue, compteur mail exclu)
// et titre d'onglet (Gmail + titre générique). Les libellés sont plausibles, pas relevés dans Gmail :
// seul T9 (DEBUG dans un vrai Gmail dans cette langue) peut les confirmer.
const test = require('node:test');
const assert = require('node:assert/strict');
const { SELECTORS } = require('../adapters/gmail.js');
const { UNREAD_WORDS, countUnreadInLabels, findUnread, parseUnreadCount, parseGmailTitle } = require('../lib/parse.js');

const patterns = { unreadPattern: SELECTORS.unreadWords, excludePattern: SELECTORS.exclude };
const topFrameCount = (labels) => countUnreadInLabels(labels.filter((l) => SELECTORS.topFrameChatHint.test(l)), patterns);
const chatFrameCount = (labels) => countUnreadInLabels(labels, patterns);

const CASES = {
  en: {
    badge: 'Chat, 3 unread messages',
    conversation: 'Alice Martin, unread',
    inbox: 'Inbox 42 unread',
    gmailTitle: ['Inbox (12) - x@y - Gmail', 'Inbox'],
    tabTitle: 'Outlook – 4 unread messages',
  },
  fr: {
    badge: 'Chat, 3 messages non lus',
    conversation: 'Alice Martin, non lu',
    inbox: 'Boîte de réception, 42 messages non lus',
    gmailTitle: ['Boîte de réception (12) - x@y - Gmail', 'Boîte de réception'],
    tabTitle: 'Outlook – 4 messages non lus',
  },
  es: {
    badge: 'Chat, 3 mensajes no leídos',
    conversation: 'Alice Martin, no leído',
    inbox: 'Recibidos, 42 mensajes no leídos',
    gmailTitle: ['Recibidos (12) - x@y - Gmail', 'Recibidos'],
    tabTitle: 'Outlook – 4 mensajes no leídos',
  },
  pt_BR: {
    badge: 'Chat, 3 mensagens não lidas',
    conversation: 'Alice Martin, não lida',
    inbox: 'Caixa de entrada, 42 mensagens não lidas',
    gmailTitle: ['Caixa de entrada (12) - x@y - Gmail', 'Caixa de entrada'],
    tabTitle: 'Outlook – 4 mensagens não lidas',
  },
  pt_PT: {
    badge: 'Chat, 3 mensagens por ler',
    conversation: 'Alice Martin, não lido',
    inbox: 'Caixa de entrada, 42 mensagens não lidas',
    gmailTitle: ['Caixa de entrada (12) - x@y - Gmail', 'Caixa de entrada'],
    tabTitle: 'Outlook – 4 mensagens por ler',
  },
  it: {
    badge: 'Chat, 3 messaggi non letti',
    conversation: 'Alice Martin, non letto',
    inbox: 'Posta in arrivo, 42 messaggi non letti',
    gmailTitle: ['Posta in arrivo (12) - x@y - Gmail', 'Posta in arrivo'],
    tabTitle: 'Outlook – 4 messaggi non letti',
  },
  de: {
    badge: 'Chat, 3 ungelesene Nachrichten',
    conversation: 'Alice Martin, ungelesen',
    inbox: 'Posteingang, 42 ungelesene Nachrichten',
    gmailTitle: ['Posteingang (12) - x@y - Gmail', 'Posteingang'],
    tabTitle: 'Outlook – 4 ungelesene Nachrichten',
  },
  nl: {
    badge: 'Chat, 3 ongelezen berichten',
    conversation: 'Alice Martin, ongelezen',
    inbox: 'Postvak IN, 42 ongelezen berichten',
    gmailTitle: ['Postvak IN (12) - x@y - Gmail', 'Postvak IN'],
    tabTitle: 'Outlook – 4 ongelezen berichten',
  },
};

test('une ligne de cas par langue de UNREAD_WORDS', () => {
  assert.deepEqual(Object.keys(CASES).sort(), Object.keys(UNREAD_WORDS).sort());
});

for (const [lang, c] of Object.entries(CASES)) {
  test(`${lang} : aria-label Gmail — badge chat compté, conversation = 1, compteur mail exclu`, () => {
    assert.equal(topFrameCount([c.badge]), 3, c.badge);
    assert.equal(chatFrameCount([c.conversation]), 1, c.conversation);
    assert.equal(topFrameCount([c.inbox]), 0, c.inbox);
    assert.equal(chatFrameCount([c.inbox]), 0, `${c.inbox} (exclu même dans une frame chat)`);
  });

  test(`${lang} : titre d'onglet — Gmail et générique`, () => {
    const [title, view] = c.gmailTitle;
    assert.deepEqual(parseGmailTitle(title), { view, count: 12 });
    assert.equal(parseUnreadCount(c.tabTitle), 4, c.tabTitle);
    assert.equal(parseUnreadCount(`(4) ${c.tabTitle.split(' – ')[0]}`), 4);
  });

  test(`${lang} : toutes les variantes de genre et de nombre reconnues`, () => {
    for (const word of UNREAD_WORDS[lang]) {
      assert.deepEqual(findUnread(`Chat, 2 ${word}`), { count: 2 }, word);
      assert.deepEqual(findUnread(`Chat, 2 ${word.toUpperCase()}`), { count: 2 }, `${word} (majuscules)`);
    }
  });
}

test('mot seul sans nombre dans un titre : pas de compteur', () => {
  assert.equal(parseUnreadCount('Messages non lus - Outlook'), null);
  assert.equal(parseUnreadCount('Ungelesen | Slack'), null);
});

test('pas de faux positif sur les mots proches', () => {
  assert.equal(findUnread('Chat, 3 messages lus'), null); // fr « lus » sans « non »
  assert.equal(findUnread('Chat, 3 mensajes leídos'), null);
  assert.equal(findUnread('Chat, 3 gelesene Nachrichten'), null); // de « gelesen » sans « un »
  assert.equal(findUnread('Chat, 3 gelezen berichten'), null);
  assert.equal(findUnread('nonlu'), null);
});

test('nombre trop loin du mot : compte 1 dans un aria-label, rien dans un titre', () => {
  const label = 'Espace Projet 2024 avec une description très longue, non lu';
  assert.deepEqual(findUnread(label), { count: null });
  assert.equal(chatFrameCount([label]), 1);
});
