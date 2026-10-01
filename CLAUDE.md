# WhichProfile — source de vérité du projet

Extension Chrome (MV3) chargée dans **chaque** profil Chrome. Quand une notification arrive sur un onglet d'un site connu, elle **annonce l'identité du profil** (voix : « Gmail, Serendyme », ou motif sonore propre à l'identité). macOS dit *quel service*, WhichProfile dit *quel profil*.

- Cible : moi (designer produit multi-profils), puis freelances multi-clients et slashers.
- V1 : usage perso, publiée gratuite sur le Chrome Web Store. Pas de monétisation, pas de backend, pas de collecte.
- Code : `~/Projects/whichprofile/` (dépôt git ; s'appelait `~/Projects/lequel/` jusqu'au 2026-09-29).
- Mémoire de travail (pas de code) : `~/Library/Mobile Documents/com~apple~CloudDocs/01_Work/2026_WhichProfile/` (renommé par Julian depuis `2026_Lequel`, 2026-09-29) — copies datées de ce fichier dans `00_Cadrage/`, verdicts dans `03_Verdicts/`, textes Store dans `01_Store/`.
- Notion / Linear : tenus par Julian. Claude Code écrit les verdicts, Julian les remonte.

## Contraintes permanentes

- Manifest V3, vanilla JS, **zéro dépendance, zéro bundler, zéro build**, pas de TypeScript, pas de `npm install`. Chargeable « non empaquetée » telle quelle.
- Tests : `node --test test/` (Node natif).
- Permissions obligatoires : `identity`, `identity.email`, `offscreen`, `storage`, `tts`. Rien d'autre. Pas de `host_permissions` (les `matches` des content scripts suffisent), pas de `tabs`, `webNavigation`. **Seule exception : l'Agent mode**, avec `scripting` et `<all_urls>` en *optionnel*, demandés au clic et rendus à la désactivation.
- Aucune requête réseau, aucun analytics, aucun code distant.
- Lecture seule du DOM des sites surveillés. **Seule exception : l'Agent mode (opt-in)**, qui ajoute un badge en shadow root fermé sur chaque page, rien de lisible par la page, sans rien lire.
- **Aucun contenu de message nulle part** : ni titre, ni body, ni dans `recentPings`. Les pings ne portent que `{type, source}` ; le site est dérivé de `sender.origin` côté service worker.
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
core/bridge.js             ISOLATED, document_start, all_frames : whichprofile:notif → runtime ping
core/title-watcher.js      ISOLATED, frame principale, tous les sites sauf Gmail : compteur "(N)" en tête du titre
adapters/gmail.js          ISOLATED, mail.google.com, all_frames : chat (aria-label, bloc SELECTORS) + mail (titre)
lib/sites.js               hostname → libellé parlé (liste fermée, recoupée avec le manifest par un test)
lib/parse.js               fonctions pures : compteurs, tracker, debounce, email, UNREAD_WORDS (mots « non lu » par langue)
lib/config.js              config par défaut, réconciliation, toggles de source, shouldAnnounce, choix de voix,
                           DEFAULT_TTS_LANG (locale → voix par défaut)
lib/i18n.js                chrome.i18n : traduction des pages, valeurs par défaut de la locale (navigateur seulement)
lib/chip.js                Agent mode : modèle pur du chip (texte, role, aria-label, CSS), testé
agent/chip.js              Agent mode : content script enregistré dynamiquement (<all_urls>, frame principale, document_idle)
_locales/<code>/messages.json  en (défaut), fr, es, pt_BR, pt_PT, it, de, nl — mêmes clés partout
scripts/make-icons.py      PNG 16/32/48/128 depuis icons/icon.svg, Python stdlib (128 = 96 px + 16 px transparents)
scripts/screenshots.mjs    captures brutes Store (Node pur + Chrome for Testing) → store/screenshots/raw/
scripts/fixtures/          page locale neutre pour la capture du badge
ui/                        tokens.css, components.css, fonts/ (Bricolage Grotesque + OFL.txt) — identité v1.0.2
popup.css                  styles du popup (320 px)
docs/                      visuels du README (hors zip)
LICENSE                    MIT
scripts/pack.sh            tests puis dist/whichprofile-<version>.zip (hors .git, test/, scripts/, store/, dist/, CLAUDE.md, README.md, icons/*.svg, fichiers cachés)
store/                     textes Chrome Web Store + SUBMISSION.md (checklist dans l'ordre du formulaire)
```

## Décisions (datées)

- **2026-09-29 — Partage du code sans build.** Chaque fichier de `lib/` est un IIFE qui fait `module.exports` sous Node et pose `globalThis.WHICHPROFILE_*` dans le navigateur. Content scripts : `lib/parse.js` listé avant le script qui l'utilise dans le même bloc `js`. SW : `importScripts`. Options/popup : `<script src>`. Le test `sites.test.js` garantit que `manifest.json` et `lib/sites.js` listent les mêmes hosts.
- **2026-09-29 — Règle d'augmentation du compteur (écart A).** Avant la référence : la première valeur numérique, ou la fin d'une chauffe de 10 s, fixe la référence sans ping. Après la référence : `null` (titre sans compteur) vaut `0`. Ping uniquement si la valeur augmente.
- **2026-09-29 — Debounce en front montant (écart B).** Premier ping annoncé, puis silence par site (3 s à l'origine, **12 s** depuis le correctif T4 ci-dessous). Horodatage dans `chrome.storage.session`, file d'attente sérialisée dans le SW pour éviter la course entre pings simultanés.
- **2026-09-29 — Minimisation (écart C).** Aucun contenu transmis ni stocké. Définitif, argument Store.
- **2026-09-29 — Pas de host_permissions (écart D).**
- **2026-09-29 — Point d'extension v2 (écart E).** Toute annonce passe par `shouldAnnounce(config, now)` (lib/config.js). Config versionnée `schemaVersion: 1`.
- **2026-09-29 — Sources Gmail togglables.** `gmail-chat` ON par défaut (besoin d'origine), `gmail-mail` OFF par défaut (trop de mails sans opt-in). Les notifications du hook sur mail.google.com sont classées par frame : frame `/chat…` → `gmail-chat`, sinon → `gmail-mail` (on ne peut pas distinguer sans lire le contenu ; l'adaptateur DOM rattrape le chat). Les autres sources (`notification`, `title`) sont toujours actives.
- **2026-09-29 — Titre Gmail.** Format réel : `Boîte de réception (12) - x@y - Gmail` (compteur au milieu ; Workspace peut finir par « <Org> Mail »). Un tracker par vue (texte avant le compteur) pour qu'un changement de libellé ou l'ouverture d'un fil ne déclenche pas de faux ping. Vue reconnue sans compteur = 0.
- **2026-09-29 — Sites.** Liste fermée + `x.com` (X) et `outlook.office.com` / `outlook.live.com` (Outlook), génériques (hook + titre). Instagram : hook + titre non garantis, adaptateur prévu v1.1.
- **2026-09-29 — Voix.** Select « Voix » alimenté par `chrome.tts.getVoices` ; vide = première voix de la langue choisie (fr-FR par défaut). `rate 1.1`.
- **2026-09-29 — `enqueue: true` au lieu de `false`.** Le moteur TTS est partagé par tous les profils du même Chrome : avec `enqueue:false`, l'annonce du profil B couperait celle du profil A (T4). Le debounce borne déjà la file.
- **2026-09-29 — Le bouton Tester** passe par le vrai chemin (message au SW → `announce`) mais ignore mute et debounce, sinon il serait inutilisable pour régler un profil muet.
- **2026-09-29 — Voix chargées en différé.** Sous macOS, `chrome.tts.getVoices()` renvoie `[]` pendant ≈ 2 s après le démarrage de Chrome (constaté dans Chrome for Testing 154). Les options réessaient toutes les 500 ms ; `pickVoice` garde la voix enregistrée quand la liste est vide. « Automatique » prend la première voix de la langue dans la liste système, dont l'ordre dépend de la langue de macOS : Eddy avec macOS en anglais, Thomas avec macOS en français (observé dans Chrome for Testing 154).
- **2026-09-29 — Tests : `node --test`** sans argument (Node 22 refuse un répertoire).
- **2026-09-29 — bridge.js en document_start** (et non idle) pour ne pas rater une notification émise avant la fin du chargement.

- **2026-09-29 — i18n, 8 langues** (en, fr, es, pt_BR, pt_PT, it, de, nl). `default_locale: en`. Chaque langue existe à trois endroits, verrouillés par `test/i18n.test.js` : `_locales/<code>/`, `UNREAD_WORDS` (lib/parse.js), `DEFAULT_TTS_LANG` (lib/config.js). Message `localeCode` = locale réellement résolue par chrome.i18n (plus fiable que `getUILanguage()`).
- **2026-09-29 — Détection multilingue : le nombre est le compteur, le mot confirme.** `findUnread` repère un mot « non lu » (bornes Unicode, espaces / insécables / tirets) puis prend le nombre le plus proche (≤ 15 caractères). aria-label sans nombre proche = 1. Titre d'onglet : `(N)` en tête d'abord, sinon nombre + mot « non lu » ; le mot seul ne compte pas. `SELECTORS` (gmail.js) : mots « Espaces / conversation » et libellés de boîte de réception dans les 8 langues.
- **2026-09-29 — Voix par défaut selon la locale** (`DEFAULT_TTS_LANG`, en→en-US … nl→nl-NL ; `fr-CA` → fr-FR, inconnue → en-US). Appliquée à la création de la config uniquement : une langue enregistrée n'est jamais écrasée, et le select « Voix » prime toujours. Le libellé « profil sans compte » est traduit (message `localLabel`) ; hors navigateur, repli anglais.
- **2026-09-29 — Store : descriptions EN et FR seulement.** Les autres locales héritent de l'anglais ; traductions ajoutées si le Store montre des installs dans ces pays. Le nom et la description courte du manifest sont, eux, traduits dans les 8 langues.

- **2026-09-29 — Renommage « Lequel » → « WhichProfile ».** Nom (`extName`), description (`extDescription`, EN : « Tells you which Chrome profile just got a notification — by voice or sound. ») dans les 8 locales, README, store/, et identifiants internes (`WHICHPROFILE_*`, événement `whichprofile:notif`, logs `[WhichProfile]`). Dossier du code : `~/Projects/lequel` → **`~/Projects/whichprofile`**. Le dossier iCloud a ensuite été renommé par Julian en `2026_WhichProfile`. Une extension non empaquetée a un ID dérivé de son chemin : après le déplacement, il faut la recharger depuis le nouveau dossier dans chaque profil, et ses réglages repartent de zéro.

- **2026-09-29 — Bug T4 : double annonce d'un message chat Gmail → fenêtre anti-doublon 3 s → 12 s.** Reproduit en réel par Julian : « Gmail, ops » deux fois à quelques secondes d'écart, notification native entre les deux. Cause probable : l'adaptateur DOM détecte le message, puis le hook voit la notification native plus de 3 s après. `DEBOUNCE_MS = 12000` dans lib/config.js. La fenêtre part de la dernière annonce, pas du dernier ping : une conversation continue donne au plus une annonce par 12 s et n'est jamais bloquée.
- **2026-09-29 — Popup : 5 derniers pings** (`recentPings` dans `storage.session`, remplace `lastPing`). Chaque ping reçu par le SW est enregistré avec heure, site, source et statut (`announced`, `muted`, `debounced`, `source-disabled`), y compris ceux qui ne sont pas annoncés : c'est ce qui permet de diagnostiquer doublons et pertes sans DEBUG. Écritures sérialisées dans le SW.

- **2026-09-29 — Clôture v1.** Tests réels de Julian sur 3 profils réels, après 82a1cbb : T1, T2, T3, T4, T6, T7 ✅. T8 vérifié seulement en profil jetable (Chrome for Testing). T5 (WhatsApp) et T9 (Gmail en langue étrangère) non vérifiés.
- **2026-09-29 — Message dans une conversation déjà ouverte : pas d'annonce, voulu.** Le site le marque lu aussitôt (pas de compteur, souvent pas de notification) et l'utilisateur regarde déjà ce profil. Documenté dans README « Pourquoi ça n'a pas sonné ? ».
- **2026-09-29 — Paquet Store** : `scripts/pack.sh` sans npm. Il lance les tests, zippe, puis vérifie que chaque fichier du manifest est présent et qu'aucun fichier de dev ne l'est. `store/` et `icons/icon.svg` sont exclus en plus de la liste demandée (inutiles à l'exécution). `dist/` ignoré par git.
- **2026-09-29 — Soumission** : `store/SUBMISSION.md`. URL de confidentialité : https://github.com/jsala1/whichprofile/blob/main/store/privacy.md. Elle suppose le dépôt poussé en public, et le dépôt local n'a pas encore de remote. La petite tuile 440×280 est obligatoire et pas encore produite. La déclaration « données collectées » (e-mail) reste à trancher par Julian (recommandation : déclarer).

- **2026-09-29 — Agent mode dans la v1 (décision Julian).** Réglage OFF par défaut. À l'activation, `chrome.permissions.request({permissions:['scripting'], origins:['<all_urls>']})` depuis le clic dans les options ; refus = reste OFF. Actif = `config.agentMode` ET permissions accordées. Le SW enregistre `agent/chip.js` (`registerContentScripts`, frame principale, `document_idle`, persistant) et l'injecte dans les onglets déjà ouverts. Le chip est en Shadow DOM fermé, bas-droite, `pointer-events` limités au chip ; clic = masqué pour cet onglet (liste des onglets dans `storage.session`), `data-whichprofile` reste posé. `role="status"` et `aria-label="Chrome profile: {label}"` sont sur l'hôte (DOM de la page), en anglais dans toutes les langues puisque c'est une étiquette machine. Libellé mis à jour en direct via `storage.onChanged`. Désactivation : script désenregistré, chips retirés, permissions rendues. Une permission retirée dans `chrome://extensions` repasse la config à OFF (`permissions.onRemoved`). Un test statique interdit toute lecture du DOM dans `agent/chip.js`.
- **2026-09-29 — Conséquence confidentialité de l'Agent mode** : le libellé devient lisible par tous les sites visités. Dit dans l'aide des options, le README, privacy.md et la justification Store : choisir un libellé non personnel.
- **2026-09-29 — Nom de client retiré de l'historique** avant le premier push public : le commit de clôture v1 (ex-`55b51e0`, désormais `859106a`) nommait un profil client ; remplacé par « 3 profils réels ».

- **2026-09-29 — Dépôt GitHub** : https://github.com/jsala1/whichprofile, public, créé avec le compte `jsala1` (connecté mais inactif dans `gh`, le compte actif `ops36` n'a pas été changé). Pour pousser : `GH_TOKEN=$(gh auth token --user jsala1) git push`.
- **2026-09-29 — Visuels Store** : captures 1280×800 et tuile 440×280 produites dans Chrome for Testing (profil jetable, interface EN, libellé « Agency »), dans une copie de test de l'extension où les permissions de l'Agent mode sont déjà accordées (la boîte de permission native ne s'automatise pas). `scripts/make-promo.py` écrit la tuile en SVG (Python stdlib, sans rastérisation de texte possible) et Chrome la rend en PNG. Capture Agent mode sur discord.com/register : la page /login affiche un QR code de connexion.

- **2026-09-29 — Voix réseau exclues** (audit externe de la fiche Store). `localVoices` filtre `remote: true` dans le select « Voix » et dans `pickVoice` (choix par défaut et choix enregistré). Sans voix locale, y compris quand la liste n'est pas encore chargée après environ 3 s d'attente, le motif sonore est joué à la place : sans `voiceName`, Chrome pourrait choisir une voix réseau. Le texte annoncé ne quitte donc jamais l'appareil.
- **2026-09-29 — E-mail du profil : persisté**, dans `config.identity.email` et `identity.id` de `storage.local`, et non relu à la volée. privacy.md le déclare avec la liste complète des clés de `storage.local` et `storage.session`.
- **2026-09-29 — Textes Store alignés sur l'audit externe** : nouvel objectif unique (profil perceptible, Agent mode inclus) ; descriptions en texte brut, sans markdown ; plus de « read-only / no DOM modification » (le wrapper `Notification` et le badge de l'Agent mode sont décrits tels quels) ; limites ajoutées (conversation ouverte, dépendance à chaque site, Gmail testé en français) ; mention des marques ; privacy.md avec en-tête (date d'effet, périmètre, contact GitHub Issues).

- **2026-09-29 — Soumission Chrome Web Store** : version 1.0.0 envoyée à 23h30, ID `nkfkdanbfikhpkdhebfemmplgagjfllg`, publication différée (manuelle après validation). Page Store attendue : https://chromewebstore.google.com/detail/nkfkdanbfikhpkdhebfemmplgagjfllg (active seulement après publication).

- **2026-09-30 — v1.0.1 : le libellé n'est plus lisible par les scripts de page (Agent mode).** Avant : `data-whichprofile` sur `<html>`, puis `role`, `aria-label` et `title` sur l'hôte, donc le libellé était lisible par n'importe quel script de page. Or une extension de vie privée ne doit rien écrire de lisible par le site. Maintenant :
  - l'hôte `whichprofile-chip` n'a aucun attribut ni texte, et son nom est fixe ;
  - `role="status"`, `aria-label="Chrome profile: {label}"` et le libellé vivent uniquement sur le `.chip`, dans le shadow root fermé ;
  - le libellé visible est du contenu généré CSS (`::after { content: attr(data-label) }`), pas un nœud texte, donc `window.find()` ne peut pas le deviner par essais ;
  - construction factorisée dans `lib/chip.js` (`mountChip`), testée sous Node avec un DOM minimal et vérifiée dans Chrome ;
  - garde : les options, et le SW (raison `label-is-email`), refusent l'activation tant que le libellé est dérivé de l'e-mail (`labelDerivedFromEmail` : libellé par défaut, partie avant « @ » ou adresse complète) ; message i18n `agentModeNeedsNeutralLabel` ;
  - `agentModeHint` corrigé dans les 8 locales : il mentionnait `data-whichprofile` et « lisible par les sites ».

  Les décisions datées plus haut qui parlent de `data-whichprofile` décrivent la v1.0.0, telle que soumise.
- **Fuites résiduelles connues (Agent mode actif)** : la présence de l'élément `whichprofile-chip` révèle aux pages que l'extension est installée et le mode actif ; la taille du badge, mesurable par `elementsFromPoint`, trahit à peu près la longueur du libellé. Le libellé lui-même n'est pas lisible.

- **2026-09-30 — v1.0.1, durcissement après un audit sécurité / vie privée indépendant (2 évaluateurs).**
  1. **Compteur de titre : hystérésis** (corrigé le même jour ; la première version gardait `last` indéfiniment et cassait le cas nominal « tout lu, puis (1) »). Un titre sans compteur ne remet `last` à 0 qu'après `NULL_RESET_MS = 6000` : 6 s **continues** sans compteur, mesurées depuis la première lecture null et non en nombre de lectures (le MutationObserver de `<head>` peut appeler `check()` des dizaines de fois par seconde ; corrigé après vérification indépendante du diff). Cela **remplace la règle « null = 0 immédiatement » de l'écart A** (2026-09-29). Un clignotement (null, 1, null, 1…) n'atteint jamais le seuil : aucune annonce en boucle. En filet, un plafond par hôte (`title-watcher`, `capMs: 60000`) limite à 1 annonce par 60 s sans valeur strictement supérieure au maximum vu depuis la dernière annonce ; un « tout lu » confirmé par l'hystérésis remet ce maximum à 0, pour que le vrai nouveau message suivant soit annoncé même dans la minute. Séquences testées au rythme de 2 s, précédées d'une lecture 0 de référence : [1, ∅ pendant ≥ 6 s, 1] → 2 annonces ; [0,1,∅,1,∅,1] → 1 ; [2,∅,3] → 2 ; [2,∅,1] → 1 ; 50 null en 200 ms → pas de remise à zéro ; null continu 6,5 s → remise à zéro.
  2. **Throttle d'entrée** : `bridge.js` ignore un événement à moins de 500 ms du précédent ; `handlePing` garde `lastSeen[host]` en mémoire et répond immédiatement sous 250 ms (sans storage, sans `recordPing`, sans `loadConfig`).
  3. **Logs** : plus d'`identity.id` ni de libellé, seulement `{ hasAccount }`.
  4. **Hook** : `WeakSet` privé au lieu de `Symbol.for('whichprofile.wrapped')`, qui permettait de détecter l'extension via le trap `get` ; `showNotification` est enveloppé dans un Proxy, pour que son `toString()` ne révèle pas notre code ; `emit()` seulement si `Notification.permission === 'granted'`.
  5. **Options** : si `agent-enable` échoue après une permission accordée, la permission est retirée.
  6. **`syncAgentMode` sérialisé**, et « Duplicate script ID » ignoré.
  7. **Routage** extrait dans `lib/route.js` (fonction pure `route`), avec `message.source` en liste blanche {notification, title, gmail-chat, gmail-mail}.
  8. **Gmail DEBUG** : candidats limités à `UNREAD_PATTERN` ; clé de `mailTrackers` = `hashString(view)` (FNV-1a), jamais la vue en clair.
  9. **CSP explicite** des pages de l'extension.
  10. **Garde SW** `agentEnableRefusal` : raison `label-is-email` (libellé par défaut avec e-mail, ou retapé à l'identique).

  Nouveau `test/security.test.js` : contrôle statique des fichiers livrés, routage, hook exécuté dans `vm`. Textes Store et SUBMISSION alignés ; les instructions de test demandent d'abord d'autoriser les notifications sur discord.com, sans quoi `new Notification` ne déclenche plus rien.

- **2026-09-30 — v1.0.1, corrections après vérification indépendante du diff.**
  1. **Throttle Gmail** : la clé du throttle de 250 ms devient `hôte|source`, appliquée **après** le test de source (`pingGate`, lib/config.js). Avant, le ping `gmail-mail` (désactivé par défaut) consommait le créneau de l'hôte et le ping `gmail-chat` qui suivait était jeté : plus d'annonce de chat.
  2. **Garde « libellé neutre » après activation** : les options refusent un libellé dérivé de l'e-mail quand l'Agent mode est actif (valeur précédente restaurée, message `agentModeNeedsNeutralLabel`) ; le SW coupe le mode sur `storage.onChanged` en filet ; `agentBadgeState` n'envoie jamais un tel libellé aux onglets, et `agent/chip.js` redemande l'état au SW au lieu de lire la config brute.
  3. **Hystérésis en durée** (voir point 1 de l'entrée précédente).

- **2026-09-30 — v1.0.2 « nouvelle identité »** (prompt CTO, GO Julian).
  - **Icônes** : `icons/icon.svg` = SVG fourni, sans le bloc `<metadata>` C2PA (5 formes). PNG 16/32/48 plein cadre et 128 = 96 px de dessin + 16 px transparents, régénérés par `scripts/make-icons.py`. Aucun PNG d'iCloud : la 128 fournie n'avait pas d'alpha.
  - **Tokens** `ui/tokens.css` + composants `ui/components.css` (puce, boutons pilule, focus 3 px, `prefers-reduced-motion`). Bricolage Grotesque, OFL, avec `ui/fonts/OFL.txt` du dépôt google/fonts, pour les titres et le libellé ; les contrôles restent en `system-ui`.
  - **Rouge** (`--signal`) : seulement sur le point de la puce et sur le bouton Tester pendant la lecture (`.is-playing`, `chrome.tts.isSpeaking`). Un test statique vérifie les sélecteurs.
  - **Options** : en-tête icône 32 + version ; libellé en puce héros ; panneaux et filets ; pied de page site, contact, source, plus `footerLegal` en anglais dans les 8 locales. Nouvelles clés `footerPrivacy`, `footerContact`, `footerSource`, traduites.
  - **Aperçu de l'Agent mode** : le vrai badge de `lib/chip.js`, monté dans `#agent-preview` (un `transform` fait du cadre le bloc conteneur du `position: fixed`). La CSP `style-src 'self'` bloque le `<style>` du shadow root : `options.js` passe à `mountChip` un document qui le remplace par un `<template>` et applique la même CSS par `adoptedStyleSheets`. `lib/chip.js` n'est pas touché, sauf la couleur du point.
  - **Badge** : seule modification, la couleur du point, #e9964a → #ff6b61. Contrôle pixel sur la page neutre, v1.0.1 contre v1.0.2 : 124 pixels différents, tous dans le point (12×12 px à DPR 2).
  - **Popup** : puce, e-mail en petit, état (voix / son) + interrupteur Muet, dernier événement annoncé, boutons Réglages / Tester, et `<details>` « Derniers pings » replié. On garde le diagnostic, et les textes Store (« shown in the popup ») restent vrais.
  - **Manifest** : 1.0.2, `homepage_url` https://whichprofile.app, icônes en 4 tailles, nouvelle `extDescription` (EN / FR mot pour mot, 6 traduites). Permissions, CSP et content scripts inchangés.
  - `privacy.md` : seule modification, la ligne Contact (hello@ ou Issues GitHub). Date d'effet inchangée.
  - **Supprimés** : `scripts/make-promo.py`, `store/promo/`, `store/screenshots/*.png` (ancienne identité). Les visuels Store finaux sont composés par le CTO à partir de `store/screenshots/raw/`.

- **2026-10-01 — Fiche Store v1.0.2 : corrections de l'audit du 30/09** (`01_Store/v1.0.2_textes_corriges/CORRECTIONS_audit_2026-09-30.md`, sections A à E appliquées mot pour mot). La v1.0.0 avait été rejetée pour *keyword spam*. Désormais : descriptions qui ne nomment que 5 sites et renvoient aux captures et au README pour la liste complète ; objectif unique reformulé ; garde « libellé neutre » mentionnée dans la justification `<all_urls>` ; déclaration « PII : e-mail » décidée ; Limited Use dans privacy.md (le site /privacy doit recevoir le même patch) ; `agentModeHint` « know » → « can see » dans les 8 locales. README « Sites covered » : les 12 sites, un par ligne, vérifiés par un test contre `lib/sites.js`.

## Limites connues

- Notifications push reçues onglet fermé (service worker du site) : invisibles. Celles déclenchées depuis la page via `registration.showNotification` sont vues.
- Sélecteurs Gmail chat fragiles → bloc `SELECTORS` en tête de `adapters/gmail.js` + mode DEBUG.
- Auto-détection du compte = profil connecté à Chrome. Sinon « profil sans compte », modifiable.
- Plusieurs messages sur le même site en moins de 12 s = une seule annonce (voulu : on annonce une identité, pas chaque message).

## v2 (ne pas implémenter, ne pas rendre impossible)

Plages horaires par identité ; bouton « je partage mon écran » ; adaptateurs Instagram / Teams ; fichier audio custom par identité. Tout passe par `shouldAnnounce(config, now)` et `identity.pattern`.

## État des phases

- [x] 1. Plan validé (GO 2026-09-29), git init, CLAUDE.md
- [x] 2. Cœur générique + offscreen + options + popup + tests
- [x] 3. Adaptateur Gmail + DEBUG
- [x] 4. README + store + icônes
- [x] 5. Vérification finale (T2 + T8 dans Chrome for Testing 154, profil jetable ; T1, T3–T7, T9 à faire par Julian)
- [x] i18n 8 langues ; renommage WhichProfile ; correctif T4 (anti-doublon 12 s, 5 derniers pings)
- [x] **v1 close** (2026-09-29) : T1–T4, T6, T7 ✅ en réel ; T5, T9 non vérifiés
- [x] Agent mode (opt-in) ajouté à la v1
- [x] Dépôt public https://github.com/jsala1/whichprofile ; captures 1280×800 (`store/screenshots/`) et tuile 440×280 (`store/promo/`) produites dans Chrome for Testing
- [x] **Soumis au Chrome Web Store le 2026-09-29 à 23h30** par Julian. ID de l'extension : `nkfkdanbfikhpkdhebfemmplgagjfllg`. Publication différée : à publier manuellement après validation.
- [ ] Validation Store, puis publication manuelle ; ensuite, installer depuis le Store dans chaque profil (l'ID diffère de celui des versions non empaquetées)

## Store

- **v1.0.0 soumise** au Chrome Web Store le **29/09/2026 à 23h30 (heure de Paris)**. **Publication différée** : on publiera manuellement quand la review passe.
- ID Store : `nkfkdanbfikhpkdhebfemmplgagjfllg` (≠ ID unpacked `kdbhhfpelpfkpmkbjmjpoceogehhdipm`).
- Publisher ID : `b6dd2025-ae76-49dc-bd43-f8e2bd27c752`.
- Package soumis : `dist/whichprofile-1.0.0.zip`, produit par `sh scripts/pack.sh` au commit `2fda89d`.
- **v1.0.1 préparée le 30/09/2026** pour remplacer la 1.0.0 avant publication (libellé de l'Agent mode non lisible par les pages) : `dist/whichprofile-1.0.1.zip`. À re-soumettre par Julian.
- v1.0.1 complétée le même jour par le durcissement issu de l'audit sécurité (voir décisions) ; zip refait.
- **v1.0.2 préparée le 30/09/2026** (nouvelle identité, site https://whichprofile.app, contact hello@whichprofile.app, licence MIT) : `dist/whichprofile-1.0.2.zip`. Export pour audit CTO : iCloud `01_Store/v1.0.2_export/`.
- v1.0.1 review annulée le 01/10/2026, v1.0.2 soumise le 01/10/2026 (à corriger si on glisse).
