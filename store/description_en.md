# WhichProfile — Chrome Web Store description (EN)

## Summary (132 characters max)

Tells you which Chrome profile just got a notification — by voice or sound.

> Champ Store en texte brut : coller tout ce qui suit le titre « Description » (sans le titre). Aucun markdown.

## Description

Running several Chrome profiles at once — personal, employer, clients? When a notification pops up, your system says "Gmail" or "WhatsApp", but never which account. So you check every window.

Install WhichProfile in each profile and it announces which one was notified:
• Voice: "Gmail, Agency", "WhatsApp, Personal"… using a label you choose (by default, the part of the account address before "@").
• Sound: a tone pattern you pick for each profile (ding, double, triple, low, high).

Sites covered: Gmail (chat, and email as an option), Google Chat, WhatsApp Web, Messenger, Facebook, LinkedIn, Slack, Discord, X, Outlook. Basic detection on Instagram.

Privacy:
• Nothing leaves your computer. No network requests, no account to create, no analytics.
• WhichProfile never stores or transmits the content of your messages — it only detects that a notification arrived or that an unread counter went up.
• The profile's Google account address is used only to suggest a default label. It stays in that profile.

Honest limits:
• The site's tab must be open: notifications received while the tab is closed are not visible to WhichProfile.
• A message received in a conversation you already have open and visible is not announced: the site marks it read instantly.
• Detection relies on the notification the site creates and on the unread counter in the tab title, so it depends on each site's behaviour. Gmail chat has been tested with Gmail displayed in French; other sites and display languages are still being verified — reports welcome on GitHub.
• Gmail chat detection depends on Gmail's interface and may need an update if Google changes it.
• Several messages on the same site within 12 seconds produce a single announcement: WhichProfile announces the profile, not every message.

Optional — Agent mode (off by default): shows a small profile badge on every page so screen readers and AI browser agents can tell which profile they are in. Turning it on asks for access to all sites; turning it off removes that access. The badge reads nothing from the pages; the label is rendered on screen and in the accessibility tree only; page scripts cannot read it.

Interface available in English, French, Spanish, Portuguese (Brazil and Portugal), Italian, German and Dutch.

Free, no ads, nothing is sent anywhere.

Gmail, WhatsApp, Slack and the other names above are trademarks of their owners; WhichProfile is an independent project, not affiliated with them.
