// MAIN world, document_start, toutes les frames.
// Signale chaque notification créée par la page, sans rien en lire ni rien transmettre de son contenu :
// les arguments (titre, options) sont passés tels quels à l'API d'origine, jamais lus.
// Si le wrapping échoue, le site continue avec l'API d'origine : on ne casse jamais la page.
(() => {
  'use strict';

  const EVENT = 'whichprofile:notif';
  // Marque privée : un WeakSet local, jamais exposé. Rien sur les objets de la page (audit 2026-09-30 :
  // Symbol.for('whichprofile.wrapped'), lisible via le trap get, permettait de détecter l'extension).
  const ours = new WeakSet();

  const Original = typeof window.Notification === 'function' ? window.Notification : null;

  // Signal seulement si le site peut réellement afficher des notifications.
  const emit = () => {
    try {
      if (!Original || Original.permission !== 'granted') return;
      document.dispatchEvent(new CustomEvent(EVENT));
    } catch (_) {
      /* silencieux */
    }
  };

  // 1. new Notification(...) : Proxy qui délègue tout (permission, requestPermission, prototype) à l'original.
  try {
    if (Original && !ours.has(Original)) {
      const Wrapped = new Proxy(Original, {
        construct(target, args, newTarget) {
          const instance = Reflect.construct(target, args, newTarget === Wrapped ? target : newTarget);
          emit();
          return instance;
        },
        get(target, prop) {
          // Receveur = original : les getters statiques (permission, maxActions) restent valides.
          return Reflect.get(target, prop, target);
        },
      });
      ours.add(Wrapped);
      window.Notification = Wrapped;
    }
  } catch (_) {
    /* fallback silencieux : API d'origine intacte */
  }

  // 2. registration.showNotification(...) appelé depuis la page (WhatsApp et d'autres passent par là).
  // Proxy plutôt que fonction écrite ici : son toString() ne révèle pas le code de l'extension.
  // Les push reçus directement par le service worker du site restent invisibles : limite documentée.
  try {
    const proto = window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype;
    const original = proto && proto.showNotification;
    if (typeof original === 'function' && !ours.has(original)) {
      const wrapped = new Proxy(original, {
        apply(target, thisArg, args) {
          const result = Reflect.apply(target, thisArg, args);
          if (result && typeof result.then === 'function') result.then(emit, () => {});
          return result;
        },
      });
      ours.add(wrapped);
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'showNotification');
      Object.defineProperty(proto, 'showNotification', { ...descriptor, value: wrapped });
    }
  } catch (_) {
    /* fallback silencieux */
  }
})();
