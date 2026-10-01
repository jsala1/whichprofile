# WhichProfile — Justification des permissions (review Chrome Web Store)

## Objectif unique (single purpose)

Single purpose: make the identity of the current Chrome profile perceivable. It does this (1) by voice or a distinct sound when a supported site receives a notification on an open tab, and (2) optionally — Agent mode, off by default — as a small on-page label readable by screen readers and browser-automation agents.

## Permissions

| Permission | Justification |
|---|---|
| `identity` | Required to access the `chrome.identity` namespace, used only for `getProfileUserInfo` (no OAuth token is requested, `getAuthToken` is never called). |
| `identity.email` | Telling profiles apart is the extension's purpose; the account address is the only signal that identifies a profile. It is editable, stored in that profile only, never sent. The whole point of the extension is to tell users *which profile* was notified. `getProfileUserInfo` returns the email of the Google account signed in to the Chrome profile; the part before "@" is proposed as the default spoken label (e.g. "Gmail, alex" for alex@example.com) and the address is shown read-only in the settings and the popup so the user can check which profile they are configuring. The email is stored only in `chrome.storage.local` of that profile, never transmitted, and not written to any log. Without it, every profile would start as "profile without account" and the user would have to identify it by hand. |
| `tts` | Speaks the announcement ("Gmail, <label>") with the voices installed on the device. Only voices that Chrome reports as local are used: network voices are excluded, so the spoken text never leaves the device (without a local voice, the sound pattern plays instead). Voice mode is the default mode. |
| `offscreen` | Service workers cannot play audio. In sound mode, an offscreen document (reason `AUDIO_PLAYBACK`) synthesises a short tone pattern with WebAudio (under one second, no audio file). |
| `storage` | `storage.local`: the user's settings for this profile (label, mode, sound pattern, voice, sources, mute, debug, Agent mode) and the detected account address. `storage.session` (cleared when the browser closes): the time of the last signal retained per site (12-second de-duplication), the last 5 signals (site, signal type, time, announced or not, with the reason), shown in the popup for troubleshooting, and, in Agent mode, the tabs where the badge was hidden (`agentHidden`). No message content is stored. |

## Accès aux sites (content scripts)

Matches: `mail.google.com`, `chat.google.com`, `web.whatsapp.com`, `www.messenger.com`, `www.facebook.com`, `www.instagram.com`, `www.linkedin.com`, `app.slack.com`, `discord.com`, `x.com`, `outlook.office.com`, `outlook.live.com`, `teams.microsoft.com`, `teams.live.com`, `teams.cloud.microsoft`.

Site access at install time: closed list of 15 sites (content_scripts matches), no host_permissions, no tabs. The messaging-site content scripts do not modify the page DOM; the only changes are two wrappers, around window.Notification and ServiceWorkerRegistration.prototype.showNotification (main world), that report a creation without reading title or body. In Agent mode (optional) the extension adds one badge element to the page, and still reads nothing; the label is rendered on screen and in the accessibility tree only; page scripts cannot read it. No network request, no message content collected.

To report a new message, the content scripts send the service worker a message containing only the signal type (e.g. `{type: "ping", source: "title"}`); the site is derived from the sender origin.

## Permissions optionnelles — Agent mode (opt-in, désactivé par défaut)

| Permission | Justification |
|---|---|
| `scripting` (optional) | Agent mode only. Requested when the user turns Agent mode on in the options page, by an explicit click (`chrome.permissions.request`). Used to register one content script (`registerContentScripts`, main frame, `document_idle`) and to inject it once into already-open tabs. Turning Agent mode off unregisters the script and removes the permission (`chrome.permissions.remove`). |
| `<all_urls>` (optional host permission) | Agent mode: adds a badge on every page so screen readers and browser-automation agents can see the profile label. The badge is a custom element with no attributes and no text of its own; its content lives in a closed Shadow DOM, bottom-right, with `role="status"` and `aria-label="Chrome profile: <label>"`. The label is rendered on screen and in the accessibility tree only; page scripts cannot read it. It reads nothing and sends nothing outside the extension (two internal messages to the service worker: fetch the label, remember the badge was hidden on this tab). It must run on every site because agents browse arbitrary sites. `activeTab` does not fit: it only grants access to a tab after a user gesture on that tab, whereas an agent navigates on its own, with no user gesture per page. Removed on disable (script unregistered, permission removed). Denied or revoked: the feature stays off and the rest of the extension works unchanged. Safeguard: Agent mode cannot be turned on while the label is still derived from the account address; the user must first choose a neutral label, so the badge never shows an email address on third-party pages. |

## Code distant

None. All code is in the package.

## Données collectées (formulaire « Data usage »)

None transmitted. Declare (decided): "Personally identifiable information — email address: read locally to label the profile, not transmitted, not sold, not used for any other purpose."
