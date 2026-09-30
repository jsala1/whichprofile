// Agent mode : modèle et montage du badge injecté dans les pages (testés sous Node avec un DOM minimal).
//
// Rien de lisible par la page : l'élément hôte (dans le DOM de la page) ne porte aucun attribut, aucun texte,
// et son nom de balise est fixe (il ne dépend pas du libellé). Le libellé, role="status" et
// aria-label="Chrome profile: {label}" vivent uniquement dans un shadow root fermé.
// Le libellé visible est du contenu généré CSS (::after) et non un nœud texte : window.find() et la recherche
// dans la page ne le trouvent pas, donc un script de page ne peut pas le deviner par essais.
// Jamais d'innerHTML : un libellé contenant du HTML reste une valeur d'attribut.
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
    .chip::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      margin-right: 6px;
      border-radius: 50%;
      background: #e9964a;
      vertical-align: 1px;
    }
    .chip::after { content: attr(data-label); }
  `;

  function normalizeLabel(label) {
    const text = String(label ?? '').replace(/\s+/g, ' ').trim();
    return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
  }

  // → null si pas de libellé ; sinon ce qu'il faut pour construire le badge.
  function chipModel(label) {
    const text = normalizeLabel(label);
    if (!text) return null;
    return {
      tag: TAG,
      // Sur l'élément .chip, À L'INTÉRIEUR du shadow root fermé. L'hôte, lui, ne reçoit rien.
      chipAttributes: {
        role: 'status',
        'aria-label': `${ARIA_PREFIX}${text}`,
        'data-label': text,
      },
      text,
      css: CSS,
    };
  }

  // Construit le badge dans `doc` et l'attache à `parent`. → { host, update(model), remove() }.
  function mountChip(doc, parent, model, onClick) {
    const host = doc.createElement(model.tag);
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = model.css;
    const chip = doc.createElement('div');
    chip.className = 'chip';
    if (onClick) chip.addEventListener('click', onClick);
    shadow.append(style, chip);

    function update(next) {
      for (const [name, value] of Object.entries(next.chipAttributes)) chip.setAttribute(name, value);
    }

    update(model);
    parent.append(host);
    return { host, update, remove: () => host.remove() };
  }

  const api = { TAG, MAX_LABEL, ARIA_PREFIX, normalizeLabel, chipModel, mountChip };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WHICHPROFILE_CHIP = api;
})(globalThis);
