// Agent mode — content script enregistré dynamiquement (registerContentScripts, <all_urls>, frame principale,
// document_idle), et injecté une fois dans les onglets déjà ouverts à l'activation.
// Écrit seulement : un chip bas-droite en Shadow DOM + data-whichprofile sur <html>. Ne lit rien du DOM de la page.
(() => {
  'use strict';

  // Même monde isolé pour le script enregistré et l'injection des onglets ouverts : une seule instance.
  if (globalThis.__whichprofileAgentChip) return;
  globalThis.__whichprofileAgentChip = true;

  const { chipModel } = globalThis.WHICHPROFILE_CHIP;
  const RECONNECT_MS = 5000;

  let label = '';
  let hidden = false;
  let host = null;
  let chip = null;

  function build(model) {
    host = document.createElement(model.tag);
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = model.css;
    chip = document.createElement('div');
    chip.className = 'chip';
    chip.addEventListener('click', hide);
    shadow.append(style, chip);
  }

  function render() {
    const model = chipModel(label);
    const root = document.documentElement;
    if (!model || !root) {
      if (root) delete root.dataset.whichprofile;
      if (host) host.remove();
      return;
    }
    root.dataset.whichprofile = model.dataset;
    if (hidden) {
      if (host) host.remove();
      return;
    }
    if (!host) build(model);
    for (const [name, value] of Object.entries(model.hostAttributes)) host.setAttribute(name, value);
    chip.replaceChildren(Object.assign(document.createElement('span'), { className: 'dot' }), model.text);
    if (!host.isConnected) root.append(host);
  }

  // Masqué pour cet onglet (y compris après navigation) ; data-whichprofile reste posé pour les agents.
  function hide() {
    hidden = true;
    render();
    send({ type: 'agent-hide' });
  }

  function send(message) {
    try {
      return chrome.runtime.sendMessage(message).catch(() => null);
    } catch (_) {
      return Promise.resolve(null); // extension rechargée : script orphelin
    }
  }

  function apply(state) {
    label = state && state.enabled ? state.label : '';
    if (state && typeof state.hidden === 'boolean') hidden = state.hidden;
    render();
  }

  send({ type: 'agent-state' }).then(apply);

  // Libellé modifié, ou Agent mode désactivé : mise à jour immédiate de tous les onglets ouverts.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.config) return;
    const config = changes.config.newValue;
    apply({ enabled: !!(config && config.agentMode), label: config && config.identity ? config.identity.label : '' });
  });

  // Certaines apps remplacent le contenu de <html> : on remet le chip s'il a été détaché.
  setInterval(() => {
    if (label && !hidden && host && !host.isConnected) render();
  }, RECONNECT_MS);
})();
