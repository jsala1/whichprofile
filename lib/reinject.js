// Réinjection des content scripts dans les onglets déjà ouverts, à l'installation et à la mise à jour.
// Fonction pure, testée sous Node : la seule source de vérité est manifest.content_scripts (aucun hôte en dur).
(function (root) {
  'use strict';

  const BRIDGE = 'core/bridge.js';

  // → liste ordonnée de { matches, files, world, allFrames } à injecter, ou [] (rien à faire).
  //
  // - install : tous les blocs, le bloc MAIN (hook Notification) en premier, puis le bridge, puis le reste.
  // - update : PAS le bloc MAIN. Le hook de la version précédente vit dans le monde de la page, qui n'est pas
  //   lié au contexte de l'extension : il reste actif et continue d'émettre `whichprofile:notif`, que le
  //   nouveau bridge reçoit. Le réinjecter empilerait un Proxy de plus sur window.Notification à chaque mise
  //   à jour. Les scripts ISOLATED, eux, sont orphelins après une mise à jour (nouveau monde isolé, mesuré
  //   dans Chrome 154) : on les réinjecte, bridge en premier.
  // - chrome_update, shared_module_update… : rien.
  function planReinjection(manifest, reason) {
    if (reason !== 'install' && reason !== 'update') return [];
    const blocks = (manifest && Array.isArray(manifest.content_scripts) ? manifest.content_scripts : []).map((block) => ({
      matches: [...block.matches],
      files: [...(block.js || [])],
      world: block.world === 'MAIN' ? 'MAIN' : 'ISOLATED',
      allFrames: !!block.all_frames,
    }));
    const rank = (block) => (block.world === 'MAIN' ? 0 : block.files.includes(BRIDGE) ? 1 : 2);
    return blocks
      .filter((block) => block.files.length > 0)
      .filter((block) => reason === 'install' || block.world !== 'MAIN')
      .map((block, index) => ({ block, index }))
      .sort((a, b) => rank(a.block) - rank(b.block) || a.index - b.index)
      .map(({ block }) => block);
  }

  const api = { planReinjection };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WHICHPROFILE_REINJECT = api;
})(globalThis);
