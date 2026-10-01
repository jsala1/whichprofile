# WhichProfile — Politique de confidentialité / Privacy policy

- **En vigueur le / Effective date :** 30 septembre 2026 / September 30, 2026 (v1.0.1 : le libellé du mode agent n'est plus lisible par les pages / Agent mode label no longer readable by pages)
- **Périmètre / Scope :** l'extension Chrome WhichProfile, version 1.0.1 et suivantes, telle que distribuée sur https://github.com/jsala1/whichprofile et, une fois publiée, sur le Chrome Web Store / version 1.0.1 and later, as distributed at https://github.com/jsala1/whichprofile and, once published, on the Chrome Web Store
- **Contact :** hello@whichprofile.app — ou / or https://github.com/jsala1/whichprofile/issues

## Français

**Aucune donnée ne quitte votre appareil du fait de WhichProfile.** L'extension n'effectue aucune requête réseau et n'utilise aucun serveur, outil de statistiques ou code distant.

### Ce que l'extension lit, localement

- **L'adresse e-mail du compte Google connecté au profil Chrome** (`chrome.identity.getProfileUserInfo`). Elle sert uniquement à proposer un libellé par défaut (la partie avant « @ ») et à afficher le compte détecté dans les réglages et le popup. Elle est enregistrée dans le stockage local de l'extension, propre à ce profil (voir plus bas), et n'est jamais transmise.
- **Le fait qu'une notification a été créée** sur un des sites couverts, ou que le compteur de non-lus du titre de l'onglet a augmenté. WhichProfile ne transmet ni ne stocke **aucun contenu de message**, et ne lit jamais le titre ni le texte des notifications. Sur Gmail, le titre de l'onglet (qui peut contenir l'objet de la conversation ouverte) n'est lu que pour en extraire le compteur de non-lus, puis oublié.
- **Gmail :** l'extension lit les libellés d'accessibilité (aria-label) du panneau de navigation et des cadres du chat pour compter les éléments marqués non lus ; traités en mémoire puis oubliés. En mode DEBUG (désactivé par défaut), ceux qui ressemblent à des compteurs sont écrits dans la console de développement de l'onglet Gmail, sur votre appareil.

### Ce que l'extension stocke

Dans `chrome.storage.local`, sur cet appareil, pour ce profil, une seule entrée `config` :
- `identity` : `email` (adresse du compte détecté, vide si aucun), `id` (cette adresse, ou `local`), `label` (libellé annoncé), `labelIsDefault`, `mode` (voix ou son), `pattern` (motif sonore), `lang` (langue de la voix), `voiceName` (voix choisie) ;
- `sources` (chat et e-mails Gmail activés ou non), `muted`, `debug`, `agentMode`, `schemaVersion`.

Dans `chrome.storage.session`, effacé à la fermeture du navigateur :
- l'heure du dernier signal retenu par site (anti-doublon de 12 s) ;
- les 5 derniers signaux : site, type de signal, heure, annoncé ou non et pourquoi ;
- en mode agent, les onglets où vous avez masqué le badge.

Désinstaller l'extension supprime toutes ces données.

### Synthèse vocale

Les annonces utilisent la synthèse vocale de Chrome (`chrome.tts`). Seules les voix que Chrome déclare locales sont utilisées : les voix réseau sont exclues, donc le texte prononcé ne quitte jamais votre appareil. Sans voix locale disponible, le motif sonore est joué à la place.

### Mode agent (facultatif, désactivé par défaut)

- À l'activation, l'extension demande l'**accès à tous les sites**. En cas de refus, le mode reste désactivé.
- Une fois activé, elle ajoute sur chaque page visitée un **badge avec le libellé du profil**, pour que les lecteurs d'écran et les agents IA de navigation puissent voir dans quel profil ils se trouvent. Le libellé n'apparaît qu'à l'écran et dans l'arbre d'accessibilité : les scripts des pages ne peuvent pas le lire. Comme il est visible sur chaque page ouverte dans ce profil, l'extension refuse l'activation tant que le libellé est dérivé de votre adresse e-mail (c'est le cas par défaut) : choisissez d'abord un libellé neutre.
- Le badge ne lit rien des pages et WhichProfile n'envoie rien hors de l'extension (deux messages internes au service worker : obtenir le libellé, retenir que le badge a été masqué sur cet onglet).
- La désactivation retire le badge et l'accès à tous les sites.

L'utilisation des informations reçues des API Google respecte la Chrome Web Store User Data Policy, y compris les exigences de Limited Use.

## English

**No data leaves your device because of WhichProfile.** The extension makes no network requests and uses no server, analytics or remote code.

### What the extension reads, locally

- **The email address of the Google account signed in to the Chrome profile** (`chrome.identity.getProfileUserInfo`). It is used only to suggest a default label (the part before "@") and to show the detected account in the settings and the popup. It is saved in the extension's local storage for that profile (see below) and is never transmitted.
- **The fact that a notification was created** on a covered site, or that the unread counter in the tab title went up. WhichProfile never transmits or stores **any message content**, and never reads the title or text of notifications. On Gmail, the tab title (which can include the subject of the open conversation) is read only to extract the unread counter, then discarded.
- **Gmail:** the extension reads the accessibility labels (aria-label) of the navigation panel and of the chat frames to count items marked unread; processed in memory and discarded. In DEBUG mode (off by default) those that look like counters are written to the Gmail tab's developer console, on your device.

### What the extension stores

In `chrome.storage.local`, on this device, for this profile, a single `config` entry:
- `identity`: `email` (detected account address, empty if none), `id` (that address, or `local`), `label` (spoken label), `labelIsDefault`, `mode` (voice or sound), `pattern` (sound pattern), `lang` (voice language), `voiceName` (chosen voice);
- `sources` (Gmail chat and email on or off), `muted`, `debug`, `agentMode`, `schemaVersion`.

In `chrome.storage.session`, cleared when the browser closes:
- the time of the last signal retained per site (12-second de-duplication);
- the last 5 signals: site, signal type, time, whether it was announced and why not;
- in Agent mode, the tabs where you hid the badge.

Uninstalling the extension deletes all of this data.

### Text-to-speech

Announcements use Chrome's text-to-speech (`chrome.tts`). Only voices that Chrome reports as local are used — network voices are excluded — so the spoken text never leaves your device. If no local voice is available, the sound pattern plays instead.

### Agent mode (optional, off by default)

- Turning it on asks for **access to all sites**. If you refuse, it stays off.
- Once on, it adds to every page you visit a **badge showing the profile label**, so screen readers and AI browser agents can see which profile they are in. The label is rendered on screen and in the accessibility tree only; page scripts cannot read it. Because it is visible on every page opened in this profile, the extension will not turn this mode on while the label is derived from your email address (the default): pick a neutral label first.
- The badge reads nothing from the pages, and WhichProfile sends nothing outside the extension (two internal messages to the service worker: fetch the label, remember the badge was hidden on this tab).
- Turning it off removes the badge and the access to all sites.

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

WhichProfile est un projet indépendant, sans lien avec Google ; Chrome, Gmail et les autres noms cités sont des marques de leurs propriétaires. / WhichProfile is an independent project, not affiliated with Google; Chrome, Gmail and the other names mentioned are trademarks of their owners.
