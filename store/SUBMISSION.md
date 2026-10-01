# WhichProfile — checklist de soumission Chrome Web Store

Dans l'ordre du tableau de bord développeur (https://chrome.google.com/webstore/devconsole), onglet par onglet. Les textes à coller sont dans ce dossier `store/` ; ne pas les recopier ici, pour qu'ils ne divergent pas.

## 0. Avant de commencer

- [ ] Compte développeur Chrome Web Store actif (frais d'inscription uniques de 5 $ payés), e-mail de contact vérifié, validation en deux étapes activée sur le compte Google.
- [ ] Statut « non-professionnel » (non-trader) déclaré : extension gratuite, perso, sans activité commerciale.
- [x] Dépôt public https://github.com/jsala1/whichprofile (branche `main`, Issues activées) ; le site https://whichprofile.app et https://whichprofile.app/privacy répondent (vérifié le 2026-09-30, HTTP 200) ; privacy.md du dépôt reste la source, sans connexion (vérifié le 2026-09-29, HTTP 200).
- [ ] `sh scripts/pack.sh` → `dist/whichprofile-1.0.2.zip` (tests verts, fichiers vérifiés).

## 1. Paquet (« Add new item »)

- [ ] Téléverser `dist/whichprofile-1.0.2.zip`.
- [ ] Vérifier ce que le tableau de bord lit dans le manifest : nom **WhichProfile**, version **1.0.2**, site `https://whichprofile.app` (homepage_url), résumé = `extDescription` de chaque locale (EN : « Says which Chrome profile just got a notification — by voice or a sound. Nothing leaves your computer. »). Le résumé n'est pas modifiable dans le formulaire : il se change dans `_locales/*/messages.json`.

## 2. Fiche Store (« Store listing »)

### Détails du produit

- [ ] **Langue par défaut** : English (vient de `default_locale: "en"`).
- [ ] **Description — English** : coller le bloc sous « ## Description » de `store/description_en.md`. Texte brut, aucun markdown.
- [ ] **Description — Français** : dans le sélecteur de langue en haut de la fiche, passer à « French », coller le bloc sous « ## Description » de `store/description_fr.md`.
- [ ] Les 6 autres langues (es, pt-BR, pt-PT, it, de, nl) : **rien à saisir**, elles héritent de la fiche anglaise (nom et résumé déjà traduits par le manifest). On ajoutera des descriptions traduites si le Store montre des installations dans ces pays.
- [ ] **Catégorie** : choisir dans la liste réelle du dashboard (taxonomie plate) : celle qui contient "Communication", sinon "Workflow & Planning".

### Ressources graphiques

- [ ] **Icône du Store 128×128** : `icons/128.png`.
- [ ] **Captures d'écran** : 5 captures 1280×800 composées par le CTO : 1 hero « Ding. » · 2 options (clair) · 3 popup + badge · 4 Agent mode ON · 5 **Sites covered** (les 12 noms en texte, sans logo — exigé par la Spam FAQ quand la description n'en nomme que 5)
- [ ] **Petite tuile promotionnelle 440×280** : fournie par le CTO (`01_Store/v1.0.2_assets/promo-tile-440x280.png`, iCloud).
- [ ] Tuile marquee 1400×560 : fournie par le CTO (`01_Store/v1.0.2_assets/marquee-1400x560.png`), facultative ; vidéo : vide.

### Champs supplémentaires

- [ ] Site officiel : vide (nécessite un domaine vérifié dans la Search Console).
- [ ] Page d'accueil : https://whichprofile.app
- [ ] URL d'assistance : https://github.com/jsala1/whichprofile/issues (Issues activées) ; contact public : hello@whichprofile.app.
- [ ] Contenu pour adultes : **Non**.

## 3. Confidentialité (« Privacy »)

- [ ] **Objectif unique (single purpose)** : coller la phrase sous « ## Objectif unique (single purpose) » de `store/permissions_justification.md` :
  « Single purpose: make the identity of the current Chrome profile perceivable. It does this (1) by voice or a distinct sound when a supported site receives a notification on an open tab, and (2) optionally — Agent mode, off by default — as a small on-page label readable by screen readers and browser-automation agents. »
- [ ] **Justification des permissions** : un champ par permission. Coller la cellule correspondante du tableau de `store/permissions_justification.md` :
  - [ ] `identity`
  - [ ] `identity.email`, la plus scrutée : coller le texte complet, sans le raccourcir.
  - [ ] `offscreen`
  - [ ] `storage`
  - [ ] `tts`
  - [ ] `scripting` (optionnelle, Agent mode) : coller la ligne du tableau « Permissions optionnelles ».
- [ ] **Justification des accès aux sites** : les `matches` des content scripts comptent comme accès aux hôtes. Coller le paragraphe de « ## Accès aux sites (content scripts) », **puis** la ligne `<all_urls>` (optionnelle, Agent mode) du tableau « Permissions optionnelles » de `store/permissions_justification.md`.
  - `<all_urls>`, même optionnel, déclenche en général un examen approfondi : prévoir plusieurs jours de plus.
- [ ] **Code distant** : « Non, je n'utilise pas de code distant ».
- [ ] **Utilisation des données** (types de données collectées) :
  - Cocher **Informations personnelles identifiables** (e-mail lu localement — la User Data FAQ exige la déclaration même pour un traitement local). Rien d'autre. Cocher les 3 certifications.
- [ ] Cocher les **3 certifications** : pas de vente ni de transfert à des tiers ; pas d'usage sans rapport avec l'objectif unique ; pas d'usage pour évaluer la solvabilité ou accorder des prêts.
- [ ] **URL de la politique de confidentialité** : https://whichprofile.app/privacy

## 4. Distribution

- [ ] **Paiement** : gratuit.
- [ ] **Visibilité** : Publique. Autre option : « Non répertoriée » pour une première semaine en lien direct, puis Publique.
- [ ] **Régions** : toutes.

## 5. Instructions de test (pour le relecteur, facultatif mais utile)

- [ ] Coller :
  > Install, open the extension's options and press **Test**: the voice says "Test, <label>" (or plays a tone in Sound mode, or a tone if no local voice is installed, even in Voice mode). The label defaults to the part before "@" of the Google account signed in to the Chrome profile, or "profile without account". For a live check, open https://discord.com (no login needed), allow notifications for that site (run `await Notification.requestPermission()` in the DevTools console and accept; the extension only reacts to notifications the site is allowed to show), then run `new Notification("x")`: the extension announces "Discord, <label>". The popup lists the last 5 signals and whether they were announced. No account or credentials are required.
  >
  > Agent mode (optional <all_urls>): in the options page, set a neutral label (e.g. "Agency"), open the "AI agents" section and turn Agent mode on; accept Chrome's permission prompt. Open any https page: a small badge bottom-right reads "Agency" (role=status in the accessibility tree; not readable by page scripts). Turn Agent mode off: the badge disappears and the site access is removed (chrome://extensions → WhichProfile → Site access).

## 6. Envoyer

- [ ] Relire l'aperçu de la fiche (EN puis FR).
- [ ] « Submit for review ». Option conseillée : publication **différée**, pour publier manuellement après validation.
- [ ] Noter la date d'envoi et l'ID de l'extension dans `03_Verdicts/` (dossier iCloud) et dans Linear.

## Après publication

- [ ] L'ID publié diffère de l'ID des versions non empaquetées : installer depuis le Store dans chaque profil, retirer la version non empaquetée, puis refaire les réglages.
- [ ] Nouvelle version : incrémenter `version` dans `manifest.json`, `sh scripts/pack.sh`, téléverser dans l'onglet Paquet.
