# Lequel

Extension Chrome qui **annonce quel profil Chrome vient de recevoir une notification**.

macOS vous dit « Gmail » ou « WhatsApp », jamais *quel compte*. Lequel, installée dans chacun de vos profils, dit par exemple « Gmail, Serendyme » à voix haute, ou joue un motif sonore propre à ce profil.

- Aucune donnée ne quitte l'appareil. Aucune requête réseau. Aucun contenu de message lu, transmis ou stocké.
- Manifest V3, JavaScript sans dépendance, sans build.

## Installation (à répéter dans chaque profil)

1. Ouvrir `chrome://extensions` dans le profil.
2. Activer le **Mode développeur** (en haut à droite).
3. **Charger l'extension non empaquetée** → choisir le dossier `lequel/`.
4. Épingler l'icône Lequel si vous voulez le popup à portée de main.
5. Ouvrir les **Réglages** (popup → Réglages, ou clic droit sur l'icône → Options), vérifier le compte détecté, choisir le libellé, puis **Tester**.

Chaque profil a sa propre configuration : donnez un libellé (et en mode son, un motif) différent à chacun.

Après une mise à jour du code : `chrome://extensions` → bouton ↻ de Lequel, dans chaque profil, puis recharger les onglets surveillés.

## Configuration

| Réglage | Effet |
|---|---|
| Libellé annoncé | Ce que la voix dit après le service. Par défaut : la partie avant @ de l'email du profil, ou « profil sans compte ». |
| Mode | **Voix** (synthèse vocale de Chrome) ou **Son** (motif synthétisé, aucun fichier audio). |
| Motif sonore | ding, double, triple, grave, aigu. |
| Langue / Voix | Liste des voix installées. « Automatique » = première voix de la langue (fr-FR par défaut). |
| Sources Gmail | Messages chat : **activé** par défaut. Nouveaux e-mails : **désactivé** par défaut. |
| Muet | Plus aucune annonce ; le popup montre quand même le dernier ping. |
| Mode DEBUG | Journalise dans la console (voir « Ajuster la détection du chat Gmail »). |

## Sites surveillés

| Site | Détection |
|---|---|
| Gmail (`mail.google.com`) | Hook notifications + adaptateur chat (aria-label) + titre pour les e-mails (opt-in) |
| Google Chat, WhatsApp, Messenger, Facebook, LinkedIn, Slack, Discord, X, Outlook (`outlook.office.com`, `outlook.live.com`) | Hook notifications + compteur « (N) » en tête du titre de l'onglet |
| Instagram | Hook + titre **non garantis**, adaptateur prévu en v1.1 |

Plusieurs signaux pour un même événement (hook + titre + adaptateur) donnent **une seule** annonce : Lequel ignore les nouveaux signaux d'un site pendant 3 s après une annonce.

## Limites connues

- **Onglet fermé** : les notifications push reçues par le service worker d'un site quand son onglet est fermé sont invisibles pour l'extension. Gardez les onglets ouverts (épinglés).
- **Sélecteurs Gmail fragiles** : le chat Gmail ne change pas le titre de l'onglet. Lequel lit les `aria-label` de la nav. Gmail peut changer son DOM à tout moment → bloc `SELECTORS` en tête de `adapters/gmail.js` et mode DEBUG.
- **Auto-détection du compte** : nécessite un compte Google connecté *à Chrome* (profil). Sinon le libellé est « profil sans compte », modifiable dans les réglages.
- **Deux messages en moins de 3 s sur le même site** : une seule annonce.
- **Gmail : e-mail ou chat ?** Une notification Gmail qui ne vient pas d'une frame de chat est comptée comme « e-mail » : si les e-mails sont désactivés, elle est ignorée et c'est l'adaptateur chat qui prend le relais.

## Ajuster la détection du chat Gmail

1. Réglages → activer **Mode DEBUG**.
2. Recharger l'onglet Gmail, ouvrir la console (⌥⌘J).
3. Dans le menu de contexte de la console (« top » par défaut), regarder la frame principale **et** les frames `mail.google.com/chat/…`.
4. Chaque changement d'aria-label candidat s'affiche dans un tableau : libellé, contribution au compte, chemin par rôles. Se faire envoyer un message chat et repérer la ligne qui change.
5. Modifier le bloc `SELECTORS` en tête de `adapters/gmail.js`, recharger l'extension, recommencer.

Les décisions du service worker (ping ignoré / absorbé / annoncé) sont visibles dans `chrome://extensions` → Lequel → « service worker ».

## Développement

```sh
node --test                    # tests automatisés, Node ≥ 18, aucune dépendance
python3 scripts/make-icons.py  # régénère icons/ (Python standard, sans PIL)
```

Sous Node 22, `node --test test/` (avec un répertoire) ne fonctionne pas : utiliser `node --test` sans argument.

Toute modification de la liste des sites se fait **dans `lib/sites.js` et `manifest.json`** ; `test/sites.test.js` échoue si les deux divergent.

## Tests manuels (dans vos vrais profils)

- [ ] **T1** — Chargement non empaqueté dans le profil A → les réglages affichent l'email du profil A.
- [ ] **T2** — Bouton « Tester » → la voix dit « Test, {libellé} » ; en mode son, le motif choisi joue.
- [ ] **T3** — Le profil B envoie un message chat Gmail au profil A → annonce en moins de 3 s avec le libellé de A, **une seule fois**.
- [ ] **T4** — Deux profils, deux messages → deux annonces distinctes.
- [ ] **T5** — WhatsApp Web, message entrant → « WhatsApp, {libellé} ».
- [ ] **T6** — Rechargement de l'onglet Gmail avec des non-lus déjà présents → **aucune** annonce.
- [ ] **T7** — Muet → aucune annonce, le popup montre le dernier ping.
- [ ] **T8** — Profil non connecté à Chrome → libellé « profil sans compte », modifiable.
- [ ] **T9** — Gmail en DEBUG → les mutations candidates sont visibles en console, `SELECTORS` modifiable sans casser le reste.

## Confidentialité

Voir `store/privacy.md`. En bref : l'email du profil est lu localement pour proposer un libellé, stocké dans ce profil uniquement, et jamais transmis.
