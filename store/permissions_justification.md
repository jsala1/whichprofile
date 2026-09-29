# WhichProfile — Justification des permissions (review Chrome Web Store)

## Objectif unique (single purpose)

Make the identity of the current Chrome profile perceivable — by voice or a distinct sound when a supported site receives a notification on an open tab, and, optionally (Agent mode, off by default), as a small on-page label readable by screen readers and browser-automation agents.

## Permissions

| Permission | Justification |
|---|---|
| `identity` | Required to access the `chrome.identity` namespace, used only for `getProfileUserInfo` (no OAuth token is requested, `getAuthToken` is never called). |
| `identity.email` | The whole point of the extension is to tell users *which profile* was notified. `getProfileUserInfo` returns the email of the Google account signed in to the Chrome profile; the part before "@" is proposed as the default spoken label (e.g. "Gmail, julian") and the address is shown read-only in the settings so the user can check which profile they are configuring. The email is stored only in `chrome.storage.local` of that profile, never transmitted, never logged. Without it, every profile would start as "profile without account" and the user would have to identify it by hand. |
| `tts` | Speaks the announcement ("Gmail, <label>") with the voices installed on the device. Only local voices are used: network voices are excluded, so the spoken text never leaves the device (without a local voice, the sound pattern plays instead). Voice mode is the default mode. |
| `offscreen` | Service workers cannot play audio. In sound mode, an offscreen document (reason `AUDIO_PLAYBACK`) synthesises a short tone pattern with WebAudio (under one second, no audio file). |
| `storage` | `storage.local`: the user's settings for this profile (label, mode, sound pattern, voice, sources, mute, debug, Agent mode) and the detected account address. `storage.session` (cleared when the browser closes): the time of the last announcement per site, for the 12-second de-duplication, and the last 5 signals (site, signal type, time, announced or not, with the reason), shown in the popup for troubleshooting. No message content is stored. |

## Accès aux sites (content scripts)

Matches: `mail.google.com`, `chat.google.com`, `web.whatsapp.com`, `www.messenger.com`, `www.facebook.com`, `www.instagram.com`, `www.linkedin.com`, `app.slack.com`, `discord.com`, `x.com`, `outlook.office.com`, `outlook.live.com`.

Site access at install time: closed list of 12 sites (content_scripts matches), no host_permissions, no tabs. The messaging-site content scripts do not modify the page DOM; the only change is a wrapper around window.Notification (main world) that reports a creation without reading title or body. In Agent mode (optional) the extension adds one badge element and one attribute to the page, and still reads nothing. No network request, no message content collected.

To report a new message, the content scripts send the service worker a message containing only the signal type (e.g. `{type: "ping", source: "title"}`); the site is derived from the sender origin.

## Permissions optionnelles — Agent mode (opt-in, désactivé par défaut)

| Permission | Justification |
|---|---|
| `scripting` (optional) | Agent mode only. Requested when the user turns Agent mode on in the options page, by an explicit click (`chrome.permissions.request`). Used to register one content script (`registerContentScripts`, main frame, `document_idle`) and to inject it once into already-open tabs. Turning Agent mode off unregisters the script and removes the permission (`chrome.permissions.remove`). |
| `<all_urls>` (optional host permission) | Agent mode: adds a badge and a `data-whichprofile` attribute on every page so screen readers and browser-automation agents can identify the profile. The badge is a closed Shadow DOM element, bottom-right, `role="status"`, `aria-label="Chrome profile: <label>"`. It reads nothing and sends nothing. It must run on every site because agents browse arbitrary sites. Removed on disable (script unregistered, permission removed). Denied or revoked: the feature stays off and the rest of the extension works unchanged. |

## Code distant

None. All code is in the package.

## Données collectées (formulaire « Data usage »)

None transmitted. Declare: "Personally identifiable information — email address: read locally to label the profile, not transmitted, not sold, not used for any other purpose."
