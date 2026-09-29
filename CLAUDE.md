# Lequel — source de vérité du projet

Extension Chrome (MV3) chargée dans **chaque** profil Chrome. Quand une notification arrive sur un onglet d'un site connu, elle **annonce l'identité du profil** (voix : « Gmail, Serendyme », ou motif sonore propre à l'identité). macOS dit *quel service*, Lequel dit *quel profil*.

- Cible : moi (designer produit multi-profils), puis freelances multi-clients et slashers.
- V1 : usage perso, publiée gratuite sur le Chrome Web Store. Pas de monétisation, pas de backend, pas de collecte.
- Mémoire de travail (pas de code) : `~/Library/Mobile Documents/com~apple~CloudDocs/01_Work/2026_Lequel/` — copies datées de ce fichier dans `00_Cadrage/`, verdicts dans `03_Verdicts/`, textes Store dans `01_Store/`.
- Notion / Linear : tenus par Julian. Claude Code écrit les verdicts, Julian les remonte.

## Contraintes permanentes

- Manifest V3, vanilla JS, **zéro dépendance, zéro bundler, zéro build**, pas de TypeScript, pas de `npm install`. Chargeable « non empaquetée » telle quelle.
- Tests : `node --test test/` (Node natif).
- Permissions : `identity`, `identity.email`, `offscreen`, `storage`, `tts`. Rien d'autre. Pas de `host_permissions` (les `matches` des content scripts suffisent), pas de `tabs`, `<all_urls>`, `webNavigation`, `scripting`.
- Aucune requête réseau, aucun analytics, aucun code distant.
- Lecture seule du DOM des sites. Aucune modification.
- **Aucun contenu de message nulle part** : ni titre, ni body, ni dans `lastPing`. Les pings ne portent que `{type, source}` ; le site est dérivé de `sender.origin` côté service worker.
- Pas de logo ni de nom de marque tiers dans les icônes ou le nom.

## Architecture

```
manifest.json
background.js            SW classique (importScripts) : routage, identité, toggles, debounce, annonce
offscreen.html/.js       WebAudio : 5 motifs synthétisés (ding, double, triple, low, high)
options.html/.js/.css    libellé, mode, motif, langue, voix, sources Gmail, mute, DEBUG, Tester
popup.html/.js           identité, mute, dernier ping
core/notification-hook.js  MAIN world, document_start, all_frames : Proxy sur window.Notification
                           + wrap de ServiceWorkerRegistration.prototype.showNotification
core/bridge.js             ISOLATED, document_start, all_frames : lequel:notif → runtime ping
core/title-watcher.js      ISOLATED, frame principale, tous les sites sauf Gmail : compteur "(N)" en tête du titre
adapters/gmail.js          ISOLATED, mail.google.com, all_frames : chat (aria-label, bloc SELECTORS) + mail (titre)
lib/sites.js               hostname → libellé parlé (liste fermée, recoupée avec le manifest par un test)
lib/parse.js               fonctions pures : compteurs, tracker, debounce, email
lib/config.js              config par défaut, réconciliation, toggles de source, shouldAnnounce, choix de voix
scripts/make-icons.py      PNG 16/48/128 en Python stdlib (pas de PIL sur la machine)
store/                     textes Chrome Web Store
```

## Décisions (datées)

- **2026-09-29 — Partage du code sans build.** Chaque fichier de `lib/` est un IIFE qui fait `module.exports` sous Node et pose `globalThis.LEQUEL_*` dans le navigateur. Content scripts : `lib/parse.js` listé avant le script qui l'utilise dans le même bloc `js`. SW : `importScripts`. Options/popup : `<script src>`. Le test `sites.test.js` garantit que `manifest.json` et `lib/sites.js` listent les mêmes hosts.
- **2026-09-29 — Règle d'augmentation du compteur (écart A).** Avant la référence : la première valeur numérique, ou la fin d'une chauffe de 10 s, fixe la référence sans ping. Après la référence : `null` (titre sans compteur) vaut `0`. Ping uniquement si la valeur augmente.
- **2026-09-29 — Debounce en front montant (écart B).** Premier ping annoncé, puis silence 3 s par site. Horodatage dans `chrome.storage.session`, file d'attente sérialisée dans le SW pour éviter la course entre pings simultanés.
- **2026-09-29 — Minimisation (écart C).** Aucun contenu transmis ni stocké. Définitif, argument Store.
- **2026-09-29 — Pas de host_permissions (écart D).**
- **2026-09-29 — Point d'extension v2 (écart E).** Toute annonce passe par `shouldAnnounce(config, now)` (lib/config.js). Config versionnée `schemaVersion: 1`.
- **2026-09-29 — Sources Gmail togglables.** `gmail-chat` ON par défaut (besoin d'origine), `gmail-mail` OFF par défaut (trop de mails sans opt-in). Les notifications du hook sur mail.google.com sont classées par frame : frame `/chat…` → `gmail-chat`, sinon → `gmail-mail` (on ne peut pas distinguer sans lire le contenu ; l'adaptateur DOM rattrape le chat). Les autres sources (`notification`, `title`) sont toujours actives.
- **2026-09-29 — Titre Gmail.** Format réel : `Boîte de réception (12) - x@y - Gmail` (compteur au milieu ; Workspace peut finir par « <Org> Mail »). Un tracker par vue (texte avant le compteur) pour qu'un changement de libellé ou l'ouverture d'un fil ne déclenche pas de faux ping. Vue reconnue sans compteur = 0.
- **2026-09-29 — Sites.** Liste fermée + `x.com` (X) et `outlook.office.com` / `outlook.live.com` (Outlook), génériques (hook + titre). Instagram : hook + titre non garantis, adaptateur prévu v1.1.
- **2026-09-29 — Voix.** Select « Voix » alimenté par `chrome.tts.getVoices` ; vide = première voix de la langue choisie (fr-FR par défaut). `rate 1.1`.
- **2026-09-29 — `enqueue: true` au lieu de `false`.** Le moteur TTS est partagé par tous les profils du même Chrome : avec `enqueue:false`, l'annonce du profil B couperait celle du profil A (T4). Le debounce borne déjà la file.
- **2026-09-29 — Le bouton Tester** passe par le vrai chemin (message au SW → `announce`) mais ignore mute et debounce, sinon il serait inutilisable pour régler un profil muet.
- **2026-09-29 — bridge.js en document_start** (et non idle) pour ne pas rater une notification émise avant la fin du chargement.

## Limites connues

- Notifications push reçues onglet fermé (service worker du site) : invisibles. Celles déclenchées depuis la page via `registration.showNotification` sont vues.
- Sélecteurs Gmail chat fragiles → bloc `SELECTORS` en tête de `adapters/gmail.js` + mode DEBUG.
- Auto-détection du compte = profil connecté à Chrome. Sinon « profil sans compte », modifiable.
- Plusieurs événements sur le même site en moins de 3 s = une seule annonce.

## v2 (ne pas implémenter, ne pas rendre impossible)

Plages horaires par identité ; bouton « je partage mon écran » ; adaptateurs Instagram / Teams ; fichier audio custom par identité. Tout passe par `shouldAnnounce(config, now)` et `identity.pattern`.

## État des phases

- [x] 1. Plan validé (GO 2026-09-29), git init, CLAUDE.md
- [x] 2. Cœur générique + offscreen + options + popup + tests
- [ ] 3. Adaptateur Gmail + DEBUG
- [ ] 4. README + store + icônes
- [ ] 5. Vérification finale
