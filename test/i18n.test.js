'use strict';

// Cohérence des traductions : mêmes clés dans toutes les locales, clés utilisées présentes,
// et chaque langue déclarée partout (messages.json, UNREAD_WORDS, voix par défaut).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { UNREAD_WORDS } = require('../lib/parse.js');
const { DEFAULT_TTS_LANG } = require('../lib/config.js');

const root = path.join(__dirname, '..');
const localesDir = path.join(root, '_locales');
const LOCALES = fs.readdirSync(localesDir).filter((d) => fs.statSync(path.join(localesDir, d)).isDirectory());
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(fs.readFileSync(path.join(localesDir, l, 'messages.json'), 'utf8'))]),
);
const reference = messages.en;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('8 locales : en, fr + es, pt_BR, pt_PT, it, de, nl', () => {
  assert.deepEqual(LOCALES.sort(), ['de', 'en', 'es', 'fr', 'it', 'nl', 'pt_BR', 'pt_PT']);
});

test('chaque langue est déclarée dans messages.json, UNREAD_WORDS et DEFAULT_TTS_LANG', () => {
  assert.deepEqual(Object.keys(UNREAD_WORDS).sort(), LOCALES.sort());
  assert.deepEqual(Object.keys(DEFAULT_TTS_LANG).sort(), LOCALES.sort());
});

for (const locale of LOCALES) {
  test(`${locale} : mêmes clés que en, messages non vides, placeholders identiques`, () => {
    assert.deepEqual(Object.keys(messages[locale]).sort(), Object.keys(reference).sort());
    for (const [key, entry] of Object.entries(messages[locale])) {
      assert.ok(typeof entry.message === 'string' && entry.message.trim(), `${locale}.${key} vide`);
      assert.deepEqual(Object.keys(entry.placeholders || {}), Object.keys(reference[key].placeholders || {}), `${locale}.${key}`);
      for (const name of Object.keys(entry.placeholders || {})) {
        assert.ok(entry.message.includes(`$${name.toUpperCase()}$`), `${locale}.${key} n'utilise pas $${name.toUpperCase()}$`);
      }
    }
    assert.equal(messages[locale].localeCode.message, locale);
    assert.ok(messages[locale].extDescription.message.length <= 132, `${locale}.extDescription > 132 caractères`);
  });
}

test('toutes les clés utilisées existent', () => {
  const used = new Set();
  for (const file of ['options.html', 'popup.html']) {
    for (const m of read(file).matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
  }
  for (const file of ['options.js', 'popup.js', 'background.js', 'lib/i18n.js']) {
    for (const m of read(file).matchAll(/\bt\('([A-Za-z0-9_]+)'/g)) used.add(m[1]);
  }
  for (const m of read('manifest.json').matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(m[1]);
  assert.ok(used.size > 40, `seulement ${used.size} clés trouvées`);
  for (const key of used) assert.ok(reference[key], `clé manquante : ${key}`);
});

test('manifest : default_locale en', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_extName__');
});
