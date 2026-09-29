# WhichProfile — Justification des permissions (review Chrome Web Store)

## Objectif unique (single purpose)

Announce, by voice or by a distinct sound, which Chrome profile (Google account) just received a notification on an open tab of a supported messaging site.

## Permissions

| Permission | Justification |
|---|---|
| `identity` | Required to access the `chrome.identity` namespace, used only for `getProfileUserInfo` (no OAuth token is requested, `getAuthToken` is never called). |
| `identity.email` | The whole point of the extension is to tell users *which profile* was notified. `getProfileUserInfo` returns the email of the Google account signed in to the Chrome profile; the part before "@" is proposed as the default spoken label (e.g. "Gmail, julian") and the address is shown read-only in the settings so the user can check which profile they are configuring. The email is stored only in `chrome.storage.local` of that profile, never transmitted, never logged. Without it, every profile would start as "profile without account" and the user would have to identify it by hand. |
| `tts` | Speaks the announcement ("Gmail, <label>") with the system voices. Voice mode is the default mode. |
| `offscreen` | Service workers cannot play audio. In sound mode, an offscreen document (reason `AUDIO_PLAYBACK`) synthesises a short tone pattern with WebAudio (≤ 600 ms, no audio file). |
| `storage` | Stores the user's settings for this profile (`storage.local`) and the time of the last announcement per site for the 3-second de-duplication (`storage.session`). No message content is stored. |

## Accès aux sites (content scripts)

Matches: `mail.google.com`, `chat.google.com`, `web.whatsapp.com`, `www.messenger.com`, `www.facebook.com`, `www.instagram.com`, `www.linkedin.com`, `app.slack.com`, `discord.com`, `x.com`, `outlook.office.com`, `outlook.live.com`.

Closed list of messaging sites; no `<all_urls>`, no `host_permissions`, no `tabs`, no `scripting`. The content scripts are read-only: they detect that the page created a `Notification` (by wrapping the constructor in the page's main world, without reading its title or body), or that the unread counter in the tab title / Gmail chat badges increased. They send the service worker a message containing only the signal type (e.g. `{type: "ping", source: "title"}`); the site is derived from the sender origin. No DOM modification, no network request, no message content collected.

## Code distant

None. All code is in the package.

## Données collectées (formulaire « Data usage »)

None transmitted. Declare: "Personally identifiable information — email address: read locally to label the profile, not transmitted, not sold, not used for any other purpose."
