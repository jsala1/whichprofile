'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcile, isSourceEnabled, shouldAnnounce, pickVoice, announcementText, LOCAL_LABEL } = require('../lib/config.js');

test('première exécution : libellé = partie locale de l’email, mode voix', () => {
  const config = reconcile(undefined, 'julian@serendyme.com');
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.identity.label, 'julian');
  assert.equal(config.identity.mode, 'voice');
  assert.equal(config.identity.lang, 'fr-FR');
  assert.equal(config.muted, false);
});

test('profil sans compte → identité "local", libellé « profil sans compte »', () => {
  const config = reconcile(undefined, '');
  assert.equal(config.identity.id, 'local');
  assert.equal(config.identity.label, LOCAL_LABEL);
});

test('libellé modifié par l’utilisateur conservé si l’email change', () => {
  const stored = reconcile(undefined, '');
  stored.identity.label = 'Perso';
  stored.identity.labelIsDefault = false;
  const next = reconcile(stored, 'julian@serendyme.com');
  assert.equal(next.identity.label, 'Perso');
  assert.equal(next.identity.id, 'julian@serendyme.com');
});

test('libellé par défaut suit l’email quand le profil se connecte', () => {
  const next = reconcile(reconcile(undefined, ''), 'julian@serendyme.com');
  assert.equal(next.identity.label, 'julian');
});

test('sources : chat ON, mail OFF par défaut ; génériques toujours ON', () => {
  const config = reconcile(undefined, 'a@b.c');
  assert.equal(isSourceEnabled(config, 'gmail-chat'), true);
  assert.equal(isSourceEnabled(config, 'gmail-mail'), false);
  assert.equal(isSourceEnabled(config, 'notification'), true);
  assert.equal(isSourceEnabled(config, 'title'), true);
});

test('shouldAnnounce respecte le mute', () => {
  const config = reconcile(undefined, 'a@b.c');
  assert.equal(shouldAnnounce(config, Date.now()), true);
  config.muted = true;
  assert.equal(shouldAnnounce(config, Date.now()), false);
});

test('pickVoice : choix explicite, puis langue exacte, puis préfixe', () => {
  const voices = [
    { voiceName: 'Samantha', lang: 'en-US' },
    { voiceName: 'Amélie', lang: 'fr-CA' },
    { voiceName: 'Thomas', lang: 'fr-FR' },
  ];
  assert.equal(pickVoice(voices, 'fr-FR', ''), 'Thomas');
  assert.equal(pickVoice(voices, 'fr-FR', 'Amélie'), 'Amélie');
  assert.equal(pickVoice(voices, 'fr-BE', ''), 'Amélie');
  assert.equal(pickVoice(voices, 'de-DE', ''), '');
  assert.equal(pickVoice([], 'fr-FR', ''), '');
});

test('texte annoncé', () => {
  assert.equal(announcementText('Gmail', 'Serendyme'), 'Gmail, Serendyme');
});
