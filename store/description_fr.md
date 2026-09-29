# WhichProfile — description Chrome Web Store (FR)

## Résumé (132 caractères max)

Vous dit quel profil Chrome vient de recevoir une notification — par la voix ou par un son.

> Champ Store en texte brut : coller tout ce qui suit le titre « Description » (sans le titre). Aucun markdown.

## Description

Vous gardez plusieurs profils Chrome ouverts : perso, employeur, clients ? Quand une notification arrive, votre système affiche « Gmail » ou « WhatsApp », mais pas quel compte. Il faut alors vérifier les fenêtres une à une.

WhichProfile, installée dans chacun de vos profils, annonce l'identité du profil concerné :
• Voix : « Gmail, Agence », « WhatsApp, Perso »… avec le libellé de votre choix (par défaut, la partie de l'adresse du compte avant « @ »).
• Son : un motif sonore que vous choisissez pour chaque profil (ding, double, triple, grave, aigu).

Sites couverts : Gmail (chat, et e-mails en option), Google Chat, WhatsApp Web, Messenger, Facebook, LinkedIn, Slack, Discord, X, Outlook. Instagram en détection de base.

Respect de la vie privée :
• Aucune donnée ne quitte votre ordinateur. Aucune requête réseau, aucun compte à créer, aucune statistique.
• WhichProfile ne stocke ni ne transmet jamais le contenu de vos messages : elle détecte seulement qu'une notification est arrivée ou qu'un compteur de non-lus a augmenté.
• L'adresse du compte Google du profil sert uniquement à proposer un libellé par défaut. Elle reste dans ce profil.

Limites, en toute honnêteté :
• L'onglet du service doit être ouvert : une notification reçue onglet fermé n'est pas visible par WhichProfile.
• Un message reçu dans une conversation déjà ouverte et affichée n'est pas annoncé : le site le marque lu instantanément.
• La détection repose sur la notification créée par le site et sur le compteur de non-lus du titre de l'onglet : elle dépend donc du comportement de chaque site. Le chat Gmail a été testé avec Gmail affiché en français ; les autres sites et langues d'affichage sont en cours de vérification — vos retours sont les bienvenus sur GitHub.
• La détection du chat Gmail dépend de l'interface de Gmail et peut nécessiter une mise à jour si Google la modifie.
• Plusieurs messages sur le même site en moins de 12 secondes donnent une seule annonce : WhichProfile annonce le profil, pas chaque message.

Facultatif — Mode agent (désactivé par défaut) : affiche un petit badge du profil sur chaque page, pour que les lecteurs d'écran et les agents IA de navigation sachent dans quel profil ils se trouvent. L'activation demande l'accès à tous les sites ; la désactivation retire cet accès. Le badge ne lit rien des pages.

Interface disponible en français, anglais, espagnol, portugais (Brésil et Portugal), italien, allemand et néerlandais.

Gratuite, sans publicité, rien n'est envoyé nulle part.

Gmail, WhatsApp, Slack et les autres noms cités sont des marques de leurs propriétaires ; WhichProfile est un projet indépendant, sans lien avec eux.
