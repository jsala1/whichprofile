# WhichProfile — Politique de confidentialité / Privacy policy

Dernière mise à jour : 29 septembre 2026

## Français

**Aucune donnée ne quitte votre appareil.** WhichProfile n'effectue aucune requête réseau, n'utilise aucun serveur, aucun outil de statistiques, aucun code distant.

Ce que l'extension lit, localement :
- **L'adresse email du compte Google connecté au profil Chrome** (`chrome.identity.getProfileUserInfo`). Elle sert uniquement à proposer un libellé par défaut (la partie avant « @ ») et à afficher le compte détecté dans les réglages. Elle est stockée dans le stockage local de l'extension, propre à ce profil, et n'est jamais transmise.
- **Le fait qu'une notification a été créée** sur un des sites pris en charge, ou qu'un compteur de non-lus a augmenté (titre de l'onglet, badges de la messagerie Gmail). WhichProfile ne lit, ne transmet et ne stocke **aucun contenu de message** : ni titre, ni texte, ni expéditeur.

Ce que l'extension stocke :
- Vos réglages (libellé, mode, motif, voix, sources, muet, DEBUG) dans `chrome.storage.local`, sur cet appareil, pour ce profil.
- Pour les 5 derniers signaux : le site, le type de signal, l'heure et s'il a été annoncé ; et l'heure de la dernière annonce par site. Dans `chrome.storage.session`, effacé à la fermeture du navigateur.

Les annonces vocales utilisent la synthèse vocale de Chrome (`chrome.tts`), qui s'appuie sur les voix installées sur votre système.

Désinstaller l'extension supprime toutes ces données.

## English

**No data leaves your device.** WhichProfile makes no network requests and uses no server, analytics or remote code.

What the extension reads, locally:
- **The email address of the Google account signed in to the Chrome profile** (`chrome.identity.getProfileUserInfo`). It is used only to suggest a default label (the part before "@") and to show the detected account in the settings. It is kept in the extension's local storage for that profile and is never transmitted.
- **The fact that a notification was created** on a supported site, or that an unread counter went up (tab title, Gmail chat badges). WhichProfile does not read, transmit or store **any message content**: no title, text or sender.

What the extension stores:
- Your settings (label, mode, sound pattern, voice, sources, mute, debug) in `chrome.storage.local`, on this device, for this profile.
- For the last 5 signals: the site, the signal type, the time and whether it was announced; and the time of the last announcement per site. In `chrome.storage.session`, cleared when the browser closes.

Voice announcements use Chrome's text-to-speech (`chrome.tts`), relying on the voices installed on your system.

Uninstalling the extension deletes all of this data.
