// Agent mode — content script enregistré dynamiquement (registerContentScripts, <all_urls>, frame principale,
// document_idle), et injecté une fois dans les onglets déjà ouverts à l'activation.
// Écrit seulement un badge bas-droite dont l'hôte ne porte rien de lisible par la page (voir lib/chip.js).
// Ne lit rien du DOM de la page et n'y écrit aucun attribut.
(() => {
  'use strict';

  // Même monde isolé pour le script enregistré et l'injection des onglets ouverts : une seule instance.
  if (globalThis.__whichprofileAgentChip) return;
  globalThis.__whichprofileAgentChip = true;

  const { chipModel, mountChip } = globalThis.WHICHPROFILE_CHIP;
  const RECONNECT_MS = 5000;

  let label = '';
  let hidden = false;
  let badge = null;

  function render() {
    const model = chipModel(label);
    const root = document.documentElement;
    if (!model || hidden || !root) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) badge = mountChip(document, root, model, hide);
    else badge.update(model);
    if (!badge.host.isConnected) root.append(badge.host);
  }

  // Masqué pour cet onglet, y compris après navigation.
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

  // Libellé modifié, ou Agent mode désactivé : on redemande l'état au service worker (qui applique la garde
  // « libellé neutre »), plutôt que de lire la config brute : un libellé dérivé de l'e-mail n'arrive jamais ici.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.config) return;
    send({ type: 'agent-state' }).then(apply);
  });

  // Certaines apps remplacent le contenu de <html> : on remet le badge s'il a été détaché.
  setInterval(() => {
    if (label && !hidden && badge && !badge.host.isConnected) render();
  }, RECONNECT_MS);
})();
