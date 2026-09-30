'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chipModel, mountChip, normalizeLabel, MAX_LABEL, TAG } = require('../lib/chip.js');

// --- DOM minimal (Node n'en a pas, et le projet n'a aucune dépendance) -------------------------------
// Reproduit les règles utiles ici : un shadow root fermé n'est pas exposé par host.shadowRoot, et
// textContent ne traverse pas le shadow DOM. Les mêmes assertions sont vérifiées dans Chrome (verdict v1.0.1).
class FakeText {
  constructor(data) {
    this.data = String(data);
    this.parent = null;
  }
  get textContent() {
    return this.data;
  }
}

class FakeElement {
  constructor(tag, doc) {
    this.localName = tag.toLowerCase();
    this.ownerDocument = doc;
    this.attributes = new Map();
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this._shadow = null; // accès réservé au test : la page, elle, n'a que host.shadowRoot
  }
  get tagName() {
    return this.localName.toUpperCase();
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  getAttributeNames() {
    return [...this.attributes.keys()];
  }
  set className(value) {
    this.setAttribute('class', value);
  }
  get textContent() {
    return this.children.map((c) => c.textContent).join('');
  }
  set textContent(value) {
    this.children = [new FakeText(value)];
  }
  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === 'string' ? new FakeText(node) : node;
      if (child.parent) child.parent.children = child.parent.children.filter((c) => c !== child);
      child.parent = this;
      this.children.push(child);
    }
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  get isConnected() {
    let node = this;
    while (node.parent) node = node.parent;
    return node === this.ownerDocument.documentElement;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  click() {
    for (const fn of this.listeners.click || []) fn({ type: 'click' });
  }
  attachShadow({ mode }) {
    this._shadow = new FakeElement('#shadow-root', this.ownerDocument);
    this._shadow.mode = mode;
    return this._shadow;
  }
  get shadowRoot() {
    return this._shadow && this._shadow.mode === 'open' ? this._shadow : null;
  }
}

function fakeDocument() {
  const doc = { createElement: (tag) => new FakeElement(tag, doc) };
  doc.documentElement = new FakeElement('html', doc);
  return doc;
}

// Tous les nœuds texte d'un arbre (y compris dans le shadow, pour le test).
function texts(node) {
  if (node instanceof FakeText) return [node.data];
  return [...node.children, ...(node._shadow ? [node._shadow] : [])].flatMap(texts);
}

function mount(label, onClick) {
  const doc = fakeDocument();
  const badge = mountChip(doc, doc.documentElement, chipModel(label), onClick);
  return { doc, badge, host: badge.host, chip: badge.host._shadow.children.find((c) => c.localName === 'div') };
}

// --- Modèle ---------------------------------------------------------------------------------------------

test('modèle : role, aria-label « Chrome profile: {label} » et libellé réservés au chip (dans le shadow)', () => {
  const model = chipModel('Serendyme');
  assert.equal(model.tag, TAG);
  assert.deepEqual(model.chipAttributes, {
    role: 'status',
    'aria-label': 'Chrome profile: Serendyme',
    'data-label': 'Serendyme',
  });
  assert.equal(model.hostAttributes, undefined);
  assert.equal(model.dataset, undefined);
  assert.match(model.css, /position: fixed/);
  assert.match(model.css, /pointer-events: auto/);
  assert.match(model.css, /::after \{ content: attr\(data-label\); \}/);
});

test('modèle : libellé vide → pas de badge ; espaces normalisés ; libellé long tronqué', () => {
  assert.equal(chipModel(''), null);
  assert.equal(chipModel('   '), null);
  assert.equal(chipModel(undefined), null);
  assert.equal(normalizeLabel('  Agence\n  Nord  '), 'Agence Nord');
  const long = chipModel('x'.repeat(200));
  assert.equal(long.text.length, MAX_LABEL);
  assert.ok(long.text.endsWith('…'));
});

// --- Badge monté dans un document -------------------------------------------------------------------------

test('badge monté : la page ne peut pas lire le libellé (shadowRoot null, aucun attribut, textContent vide)', () => {
  const { host } = mount('Serendyme');
  assert.equal(host.shadowRoot, null);
  assert.deepEqual(host.getAttributeNames(), []);
  assert.equal(host.textContent, '');
  assert.ok(host.isConnected);
});

test('badge monté : nom d’élément fixe, sans rapport avec le libellé', () => {
  const a = mount('Serendyme').host;
  const b = mount('Perso').host;
  assert.equal(a.localName, TAG);
  assert.equal(a.localName, b.localName);
  assert.ok(!a.localName.includes('serendyme'));
});

test('badge monté : role, aria-label et libellé uniquement sur le chip, dans le shadow root fermé', () => {
  const { host, chip } = mount('Serendyme');
  assert.equal(host._shadow.mode, 'closed');
  assert.equal(chip.getAttribute('role'), 'status');
  assert.equal(chip.getAttribute('aria-label'), 'Chrome profile: Serendyme');
  assert.equal(chip.getAttribute('data-label'), 'Serendyme');
  // Aucun nœud texte ne contient le libellé (il est rendu par CSS ::after) : window.find() ne le trouve pas.
  assert.ok(texts(host).every((t) => !t.includes('Serendyme')));
});

test('badge monté : un libellé contenant du HTML reste une valeur d’attribut', () => {
  const { host, chip } = mount('<img src=x onerror=alert(1)> "Perso"');
  assert.equal(chip.getAttribute('data-label'), '<img src=x onerror=alert(1)> "Perso"');
  assert.equal(chip.children.length, 0);
  assert.deepEqual(host.getAttributeNames(), []);
});

test('badge : libellé modifié → chip à jour, hôte toujours vide', () => {
  const { badge, host, chip } = mount('Serendyme');
  badge.update(chipModel('Agency'));
  assert.equal(chip.getAttribute('aria-label'), 'Chrome profile: Agency');
  assert.deepEqual(host.getAttributeNames(), []);
  assert.equal(host.textContent, '');
});

test('badge : clic sur le chip → callback (masquage pour l’onglet)', () => {
  let clicked = 0;
  mount('Serendyme', () => clicked++).chip.click();
  assert.equal(clicked, 1);
});

test('désactivation : remove() retire le badge du document', () => {
  const { badge, doc } = mount('Serendyme');
  badge.remove();
  assert.equal(badge.host.isConnected, false);
  assert.equal(doc.documentElement.children.length, 0);
});

// --- Contrôles statiques ------------------------------------------------------------------------------

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\/\/.*$/gm, '');

test('agent/chip.js : aucune lecture du DOM de la page, aucune écriture d’attribut ni de texte', () => {
  const source = read('agent/chip.js');
  for (const forbidden of [
    'querySelector',
    'getElementById',
    'getElementsBy',
    'innerHTML',
    'outerHTML',
    'innerText',
    'textContent',
    'MutationObserver',
    'document.title',
    'document.body',
    'dataset',
    'setAttribute',
    'whichprofile=',
  ]) {
    assert.ok(!source.includes(forbidden), `agent/chip.js utilise ${forbidden}`);
  }
});

test('lib/chip.js : shadow root fermé, rien n’est écrit sur l’hôte, jamais d’innerHTML', () => {
  const source = read('lib/chip.js');
  assert.match(source, /attachShadow\(\{ mode: 'closed' \}\)/);
  assert.ok(!/host\.(setAttribute|textContent|dataset|title|append|innerHTML)/.test(source));
  assert.ok(!source.includes('innerHTML'));
  assert.ok(!source.includes('dataset'));
});
