// MAIN world, document_start, toutes les frames.
// Signale chaque notification créée par la page, sans rien en lire ni rien transmettre de son contenu.
// Si le wrapping échoue, le site continue avec l'API d'origine : on ne casse jamais la page.
(() => {
  'use strict';

  const EVENT = 'whichprofile:notif';
  const MARK = Symbol.for('whichprofile.wrapped');

  const emit = () => {
    try {
      document.dispatchEvent(new CustomEvent(EVENT));
    } catch (_) {
      /* silencieux */
    }
  };

  // 1. new Notification(...) : Proxy qui délègue tout (permission, requestPermission, prototype) à l'original.
  try {
    const Original = window.Notification;
    if (typeof Original === 'function' && !Original[MARK]) {
      const Wrapped = new Proxy(Original, {
        construct(target, args, newTarget) {
          const instance = Reflect.construct(target, args, newTarget === Wrapped ? target : newTarget);
          emit();
          return instance;
        },
        get(target, prop) {
          if (prop === MARK) return true;
          // Receveur = original : les getters statiques (permission, maxActions) restent valides.
          return Reflect.get(target, prop, target);
        },
      });
      window.Notification = Wrapped;
    }
  } catch (_) {
    /* fallback silencieux : API d'origine intacte */
  }

  // 2. registration.showNotification(...) appelé depuis la page (WhatsApp et d'autres passent par là).
  // Les push reçus directement par le service worker du site restent invisibles : limite documentée.
  try {
    const proto = window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype;
    const original = proto && proto.showNotification;
    if (typeof original === 'function' && !original[MARK]) {
      const wrapped = function showNotification(...args) {
        const result = original.apply(this, args);
        if (result && typeof result.then === 'function') result.then(emit, () => {});
        return result;
      };
      Object.defineProperty(wrapped, MARK, { value: true });
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'showNotification');
      Object.defineProperty(proto, 'showNotification', { ...descriptor, value: wrapped });
    }
  } catch (_) {
    /* fallback silencieux */
  }
})();
