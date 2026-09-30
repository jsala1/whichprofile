'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  reconcile,
  isSourceEnabled,
  shouldAnnounce,
  pickVoice,
  localVoices,
  announcementText,
  ttsLangForLocale,
  pushRecentPing,
  LOCAL_LABEL,
} = require('../lib/config.js');

// Ce que passe l'extension quand l'interface de Chrome est en français (voir lib/i18n.js).
const FR = { localLabel: 'profil sans compte', lang: 'fr-FR' };

test('première exécution : libellé = partie locale de l’email, mode voix', () => {
  const config = reconcile(undefined, 'julian@example.com', FR);
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.identity.label, 'julian');
  assert.equal(config.identity.mode, 'voice');
  assert.equal(config.identity.lang, 'fr-FR');
  assert.equal(config.muted, false);
});

test('profil sans compte → identité "local", libellé « profil sans compte »', () => {
  const config = reconcile(undefined, '', FR);
  assert.equal(config.identity.id, 'local');
  assert.equal(config.identity.label, 'profil sans compte');
});

test('sans locale (hors navigateur) : repli anglais', () => {
  const config = reconcile(undefined, '');
  assert.equal(config.identity.label, LOCAL_LABEL);
  assert.equal(config.identity.lang, 'en-US');
});

test('langue TTS par défaut selon la locale de l’interface', () => {
  const expected = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', pt_BR: 'pt-BR', pt_PT: 'pt-PT', it: 'it-IT', de: 'de-DE', nl: 'nl-NL' };
  for (const [locale, lang] of Object.entries(expected)) assert.equal(ttsLangForLocale(locale), lang, locale);
  assert.equal(ttsLangForLocale('pt-BR'), 'pt-BR'); // forme navigateur
  assert.equal(ttsLangForLocale('fr-CA'), 'fr-FR'); // langue de base
  assert.equal(ttsLangForLocale('pt'), 'pt-BR'); // première variante
  assert.equal(ttsLangForLocale('ja'), 'en-US'); // inconnue
});

test('la langue enregistrée prime sur la locale', () => {
  const stored = reconcile(undefined, 'a@b.c', FR);
  stored.identity.lang = 'de-DE';
  assert.equal(reconcile(stored, 'a@b.c', FR).identity.lang, 'de-DE');
});

test('libellé modifié par l’utilisateur conservé si l’email change', () => {
  const stored = reconcile(undefined, '', FR);
  stored.identity.label = 'Perso';
  stored.identity.labelIsDefault = false;
  const next = reconcile(stored, 'julian@example.com');
  assert.equal(next.identity.label, 'Perso');
  assert.equal(next.identity.id, 'julian@example.com');
});

test('libellé par défaut suit l’email quand le profil se connecte', () => {
  const next = reconcile(reconcile(undefined, ''), 'julian@example.com');
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
  assert.equal(pickVoice([], 'fr-FR', 'Thomas'), ''); // aucune voix locale connue : pas de voix (motif sonore à la place)
});

test('texte annoncé', () => {
  assert.equal(announcementText('Gmail', 'Serendyme'), 'Gmail, Serendyme');
});

test('historique du popup : 5 derniers pings, le plus récent en tête', () => {
  let list;
  for (let i = 1; i <= 7; i++) list = pushRecentPing(list, { at: i, site: 'x.com', source: 'title', announced: true, status: 'announced' });
  assert.deepEqual(list.map((p) => p.at), [7, 6, 5, 4, 3]);
});

test('historique du popup : aucun champ de contenu', () => {
  const [entry] = pushRecentPing(undefined, { at: 1, site: 'mail.google.com', siteLabel: 'Gmail', source: 'gmail-chat', announced: false, status: 'debounced' });
  assert.deepEqual(Object.keys(entry).sort(), ['announced', 'at', 'site', 'siteLabel', 'source', 'status']);
});

test('voix réseau exclues du choix par défaut, du choix enregistré et de la liste', () => {
  const voices = [
    { voiceName: 'Google français', lang: 'fr-FR', remote: true },
    { voiceName: 'Thomas', lang: 'fr-FR', remote: false },
    { voiceName: 'Amélie', lang: 'fr-CA' },
    { voiceName: 'Google Deutsch', lang: 'de-DE', remote: true },
  ];
  assert.equal(pickVoice(voices, 'fr-FR', ''), 'Thomas'); // la voix réseau fr-FR, placée avant, est ignorée
  assert.equal(pickVoice(voices, 'fr-FR', 'Google français'), 'Thomas'); // choix enregistré réseau ignoré
  assert.equal(pickVoice(voices, 'de-DE', ''), ''); // seule une voix réseau existe pour cette langue
  assert.deepEqual(localVoices(voices).map((v) => v.voiceName), ['Thomas', 'Amélie']);
  assert.equal(pickVoice([{ voiceName: 'Google US English', lang: 'en-US', remote: true }], 'en-US', ''), '');
});

const { labelDerivedFromEmail } = require('../lib/config.js');

test('garde Agent mode : libellé dérivé de l’e-mail → activation refusée', () => {
  const email = 'julian@example.com';
  assert.equal(labelDerivedFromEmail(reconcile(undefined, email, FR).identity), true); // libellé par défaut « julian »
  assert.equal(labelDerivedFromEmail({ email, label: 'julian', labelIsDefault: false }), true); // retapé à l'identique
  assert.equal(labelDerivedFromEmail({ email, label: ' Julian ', labelIsDefault: false }), true); // casse / espaces
  assert.equal(labelDerivedFromEmail({ email, label: 'julian@example.com', labelIsDefault: false }), true);
  assert.equal(labelDerivedFromEmail({ email, label: 'Agence', labelIsDefault: false }), false);
  assert.equal(labelDerivedFromEmail(reconcile(undefined, '', FR).identity), false); // profil sans compte
});
