# WhichProfile — Chrome Web Store description (EN) — v1.0.2, audité le 30/09/2026 (2 évaluateurs)

## Summary — comes from `extDescription` in `_locales/en/messages.json` (not editable in the dashboard, 102/132)

Says which Chrome profile just got a notification — by voice or a sound. Nothing leaves your computer.

> Champ Store en texte brut : coller tout ce qui suit le titre « Description » (sans le titre). Aucun markdown. Après collage, vérifier dans l'aperçu que les « • » restent en début de ligne.

## Description

Running several Chrome profiles at once — personal, employer, clients? When a notification pops up, your system says "Gmail" or "WhatsApp", but never which account. So you check every window.

Install WhichProfile in each profile and it announces which one was notified:
• Voice: "Gmail, Agency", "WhatsApp, Personal"… using a label you choose (by default, the part of the account address before "@"), spoken by a voice installed on your device — network voices are never used.
• Sound: a tone pattern you pick for each one (ding, double, triple, low, high).

It watches a fixed list of messaging and social sites — among them Gmail (chat, and email as an option), WhatsApp Web, Slack, Discord and Outlook. The full list is shown in the screenshots and in the README on GitHub.

Privacy:
• Nothing leaves your computer. No network requests, no account to create, no analytics.
• WhichProfile never stores or transmits the content of your messages — it only detects that a notification arrived or that an unread counter went up.
• The profile's Google account address is read only to suggest a default label and to show, in the settings and the popup, which account this profile is. It stays in that profile.

Honest limits:
• The site's tab must be open: notifications received while the tab is closed are not visible to WhichProfile.
• A message received in a conversation you already have open and visible is usually not announced: most sites mark it read instantly.
• Detection relies on the notification the site creates and on the unread counter in the tab title, so it depends on each site's behaviour. Gmail chat has been tested with the interface displayed in French, and its detection may need an update when that interface changes; other sites and display languages are still being verified — reports welcome on GitHub.
• Several messages on the same site within 12 seconds produce a single announcement: WhichProfile announces the profile, not every message.

Optional — Agent mode (off by default): shows a small badge on every page so screen readers and AI browser agents can see which profile they are in. Turning it on asks for access to all sites; turning it off removes that access. The badge reads nothing from the pages; the label is rendered on screen and in the accessibility tree only; page scripts cannot read it.

Interface available in English, French, Spanish, Portuguese (Brazil and Portugal), Italian, German and Dutch.

Free, no ads, nothing is sent anywhere.

Product names mentioned are trademarks of their owners. WhichProfile is an independent project, not affiliated with Google or with any of them.
