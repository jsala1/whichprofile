'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chipModel, normalizeLabel, MAX_LABEL, TAG } = require('../lib/chip.js');

test('chip : aria-label « Chrome profile: {label} », role status, texte et data-whichprofile = libellé', () => {
  const model = chipModel('Serendyme');
  assert.equal(model.tag, TAG);
  assert.equal(model.hostAttributes.role, 'status');
  assert.equal(model.hostAttributes['aria-label'], 'Chrome profile: Serendyme');
  assert.equal(model.text, 'Serendyme');
  assert.equal(model.dataset, 'Serendyme');
  assert.match(model.css, /position: fixed/);
  assert.match(model.css, /bottom: 12px/);
  assert.match(model.css, /right: 12px/);
  assert.match(model.css, /pointer-events: auto/);
});

test('chip : libellé vide → pas de chip', () => {
  assert.equal(chipModel(''), null);
  assert.equal(chipModel('   '), null);
  assert.equal(chipModel(undefined), null);
});

test('chip : espaces normalisés, libellé long tronqué', () => {
  assert.equal(normalizeLabel('  Agence\n  Nord  '), 'Agence Nord');
  const long = chipModel('x'.repeat(200));
  assert.equal(long.text.length, MAX_LABEL);
  assert.ok(long.text.endsWith('…'));
});

test('chip : un libellé contenant du HTML reste du texte brut (posé par textContent / setAttribute)', () => {
  const model = chipModel('<img src=x onerror=alert(1)> "Perso"');
  assert.equal(model.text, '<img src=x onerror=alert(1)> "Perso"');
  assert.equal(model.hostAttributes['aria-label'], 'Chrome profile: <img src=x onerror=alert(1)> "Perso"');
});

test('agent/chip.js : aucune lecture du DOM de la page, aucun innerHTML', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'agent', 'chip.js'), 'utf8').replace(/\/\/.*$/gm, '');
  for (const forbidden of [
    'querySelector',
    'getElementById',
    'getElementsBy',
    'innerHTML',
    'outerHTML',
    'innerText',
    'MutationObserver',
    'document.title',
    'document.body',
  ]) {
    assert.ok(!source.includes(forbidden), `agent/chip.js utilise ${forbidden}`);
  }
  assert.match(source, /attachShadow\(\{ mode: 'closed' \}\)/);
  assert.match(source, /dataset\.whichprofile/);
});
