// Agent mode : description pure du chip injecté dans les pages (testée sous Node).
// Le chip n'est construit qu'avec createElement / setAttribute / textContent : jamais d'innerHTML,
// donc un libellé contenant du HTML reste du texte.
(function (root) {
  'use strict';

  const TAG = 'whichprofile-chip';
  const MAX_LABEL = 60;
  // En anglais dans toutes les langues : c'est une étiquette lue par des agents, pas un texte d'interface.
  const ARIA_PREFIX = 'Chrome profile: ';

  const CSS = `
    :host { all: initial; }
    .chip {
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 2147483647;
      pointer-events: auto;
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(29, 31, 36, 0.82);
      color: #ecebe8;
      font: 500 11px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      letter-spacing: 0.01em;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
      cursor: pointer;
      opacity: 0.85;
      user-select: none;
    }
    .chip:hover { opacity: 1; }
    .dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      margin-right: 6px;
      border-radius: 50%;
      background: #e9964a;
      vertical-align: 1px;
    }
  `;

  function normalizeLabel(label) {
    const text = String(label ?? '').replace(/\s+/g, ' ').trim();
    return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
  }

  // → null si pas de libellé ; sinon tout ce qu'il faut pour construire le chip et marquer la page.
  function chipModel(label) {
    const text = normalizeLabel(label);
    if (!text) return null;
    return {
      tag: TAG,
      // Sur l'élément hôte (DOM de la page) : visible par les agents qui lisent le HTML ou l'arbre d'accessibilité.
      hostAttributes: {
        role: 'status',
        'aria-label': `${ARIA_PREFIX}${text}`,
        title: `${ARIA_PREFIX}${text}`,
      },
      // Dans le Shadow DOM : le texte visible.
      text,
      // document.documentElement.dataset.whichprofile
      dataset: text,
      css: CSS,
    };
  }

  const api = { TAG, MAX_LABEL, ARIA_PREFIX, normalizeLabel, chipModel };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WHICHPROFILE_CHIP = api;
})(globalThis);
