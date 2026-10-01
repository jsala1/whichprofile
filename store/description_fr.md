# WhichProfile — description Chrome Web Store (FR) — v1.0.2, auditée le 30/09/2026 (2 évaluateurs)

## Résumé — vient de `extDescription` dans `_locales/fr/messages.json` (non modifiable dans le dashboard, 120/132)

Dit quel profil Chrome vient de recevoir une notification — à voix haute ou par un son. Rien ne quitte votre ordinateur.

> Champ Store en texte brut : coller tout ce qui suit le titre « Description » (sans le titre). Aucun markdown.

## Description

Vous gardez plusieurs profils Chrome ouverts : perso, employeur, clients ? Quand une notification arrive, votre système affiche « Gmail » ou « WhatsApp », mais pas quel compte. Il faut alors vérifier les fenêtres une à une.

WhichProfile, installée dans chacun de vos profils, annonce l'identité du profil concerné :
• Voix : « Gmail, Agence », « WhatsApp, Perso »… avec le libellé de votre choix (par défaut, la partie de l'adresse du compte avant « @ »), lue par une voix installée sur votre appareil — les voix réseau ne sont jamais utilisées.
• Son : un motif sonore que vous choisissez pour chacun (ding, double, triple, grave, aigu).

Elle surveille une liste fermée de sites de messagerie et de réseaux sociaux — dont Gmail (chat, et e-mails en option), WhatsApp Web, Slack, Discord et Outlook. La liste complète figure dans les captures d'écran et dans le README sur GitHub.

Respect de la vie privée :
• Aucune donnée ne quitte votre ordinateur. Aucune requête réseau, aucun compte à créer, aucune statistique.
• WhichProfile ne stocke ni ne transmet jamais le contenu de vos messages : elle détecte seulement qu'une notification est arrivée ou qu'un compteur de non-lus a augmenté.
• L'adresse du compte Google du profil est lue uniquement pour proposer un libellé par défaut et pour afficher, dans les réglages et le popup, à quel compte correspond ce profil. Elle reste dans ce profil.

Limites, en toute honnêteté :
• L'onglet du service doit être ouvert : une notification reçue onglet fermé n'est pas visible par WhichProfile.
• Un message reçu dans une conversation déjà ouverte et affichée n'est en général pas annoncé : la plupart des sites le marquent lu instantanément.
• La détection repose sur la notification créée par le site et sur le compteur de non-lus du titre de l'onglet : elle dépend donc du comportement de chaque site. Le chat Gmail a été testé avec l'interface affichée en français, et sa détection peut nécessiter une mise à jour quand cette interface change ; les autres sites et langues d'affichage sont en cours de vérification — vos retours sont les bienvenus sur GitHub.
• Plusieurs messages sur le même site en moins de 12 secondes donnent une seule annonce : WhichProfile annonce le profil, pas chaque message.
• Après une installation ou une mise à jour, rechargez les onglets déjà ouverts (ou redémarrez Chrome).

Facultatif — Mode agent (désactivé par défaut) : affiche un petit badge sur chaque page, pour que les lecteurs d'écran et les agents IA de navigation puissent voir dans quel profil ils se trouvent. L'activation demande l'accès à tous les sites ; la désactivation retire cet accès. Le badge ne lit rien des pages ; le libellé n'apparaît qu'à l'écran et dans l'arbre d'accessibilité : les scripts des pages ne peuvent pas le lire.

Interface disponible en français, anglais, espagnol, portugais (Brésil et Portugal), italien, allemand et néerlandais.

Gratuite, sans publicité, rien n'est envoyé nulle part.

Les noms de produits cités sont des marques de leurs propriétaires. WhichProfile est un projet indépendant, sans lien avec Google ni avec eux.
