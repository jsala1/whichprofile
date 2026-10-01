# Réinjection des content scripts à l'installation / mise à jour — notes pour la v1.1

Branche `wip/reinject`, créée à partir de `d244515` (« feat(reliability): re-attach content scripts to open tabs on
install/update »). Ce travail a été **sorti de la v1.0.2** (revert `ed46642` sur `main`), remplacé par un bandeau
« rechargez les onglets déjà ouverts » dans les options (`5727056`).

## Le problème d'origine

Après une installation ou une mise à jour de l'extension, les onglets déjà ouverts des sites couverts (Gmail épinglé,
WhatsApp…) n'ont pas les content scripts de la nouvelle version : aucune annonce jusqu'à un rechargement manuel.
Chrome n'injecte les `content_scripts` du manifest que dans les pages chargées *après* l'installation.

## Ce que fait la branche

- `lib/reinject.js` — `planReinjection(manifest, reason)`, fonction pure, seule source de vérité :
  `manifest.content_scripts`. `install` : tous les blocs (hook MAIN → bridge → autres). `update` : sans le bloc MAIN
  (le hook de l'ancienne version survit dans le monde de la page). Autres raisons : rien.
- `background.js` — `onInstalled` (`install` / `update`) : pour chaque bloc, `tabs.query({ url: matches })` puis
  `scripting.executeScript` onglet par onglet (onglets `discarded` ignorés, erreurs attrapées par onglet,
  log `{ reason, onglets }` sans URL).
- `scripting` passe en permission **requise** ; `host_permissions` = exactement les 15 hôtes des `matches`.
- `AGENT_PERMISSIONS = { origins: ['<all_urls>'] }` (sans `scripting`) dans `background.js` et `options.js`.
- Garde anti-double exécution (`__whichprofileBridge`, `__whichprofileTitleWatcher`, `__whichprofileGmail`) dans le
  monde isolé seulement ; `core/bridge.js` orphelin se désinscrit (`removeEventListener`).
- Tests : `test/reinject.test.js` (9 tests), test des permissions réécrit ; 151/151 sur la branche.

## Mesures — Chrome for Testing 154.0.8037.92 (mac-arm64), profil jetable, 2026-10-01

| Question | Résultat |
|---|---|
| `tabs.query({ url: 'https://discord.com/*' })` avec seulement les `matches` des content scripts (sans `host_permissions`, sans `tabs`) | **0 onglet**, alors qu'un onglet discord.com est ouvert. `tab.url` masquée dans `tabs.query({})`. `permissions.getAll()` liste pourtant les 15 hôtes. Idem avec `url: '<all_urls>'`. |
| `scripting.executeScript` sur discord.com avec seulement les `matches` | **Refusé** : « Cannot access contents of the page. Extension manifest must request permission to access the respective host. » |
| Les mêmes appels avec `host_permissions` = les 15 hôtes des `matches` | `tabs.query({ url })` trouve l'onglet ; l'injection passe. |
| Après « Recharger » (`Extensions.loadUnpacked` sur le même dossier = `update`), une injection voit-elle le monde isolé de l'ancienne version ? | **Non** : monde isolé neuf (marque posée par l'ancienne version invisible, `WHICHPROFILE_PARSE` absent). L'ancien monde survit, orphelin (`chrome.runtime.id` indéfini). Les drapeaux anti-double exécution ne bloquent donc pas la réinjection. |
| `chrome.runtime.reload()` depuis le SW sur une extension chargée par `--load-extension` | Le SW ne redémarre pas seul ; les pages d'extension rouvertes n'ont pas `chrome.scripting`. Artefact du chargement en ligne de commande : utiliser `--remote-debugging-pipe --enable-unsafe-extension-debugging` + `Extensions.loadUnpacked` pour simuler une mise à jour. |
| Bout en bout avec la branche (8/8) | Onglet discord.com ouvert **avant** l'installation : hook + bridge réinjectés, notification annoncée sans recharger. Après « Recharger » : annonce (ancien hook + nouveau bridge), une seule ligne ; title-watcher réinjecté (« (1) Discord » annoncé). SW actif. |

Non mesuré dans Chrome for Testing : l'activation de l'Agent mode (la fenêtre de permission native ne s'automatise
pas), donc ni `permissions.request` ni `permissions.remove` de `<all_urls>` avec la branche.

## Pourquoi c'est sorti de la v1.0.2

- **Symptôme observé dans un vrai Chrome** (profil Perso, recette du 2026-10-01) : activer l'Agent mode affiche
  « Failed: permission-denied », **sans aucune fenêtre de permission**.
- **Soupçon de l'audit** : `chrome.permissions.remove({ origins: ['<all_urls>'] })` serait refusé parce que
  `<all_urls>` recoupe les `host_permissions` requis (les 15 sites) ; la désactivation ne retirerait plus
  `<all_urls>`. Même famille de cause probable pour l'activation : `permissions.request` / `contains` sur une
  origine optionnelle qui englobe des origines requises.

## Pistes pour la v1.1

1. Reproduire le symptôme avec la branche dans un vrai profil (chrome://extensions, pas `--load-extension`) et
   tracer `permissions.contains / request / remove({ origins: ['<all_urls>'] })` dans la console du SW.
2. Si le recoupement est confirmé : Agent mode avec une origine optionnelle qui ne recoupe pas les hôtes requis
   (ex. `https://*/*` moins les 15 sites n'existe pas en match pattern → envisager de demander `<all_urls>` mais de
   ne jamais le retirer partiellement, ou de passer l'Agent mode en `activeTab` + action explicite).
3. Alternative sans `host_permissions` : pas de réinjection, mais détecter les onglets non instrumentés et proposer
   le rechargement (le bandeau de la v1.0.2 en est la version minimale).
4. Garder les tests manuels T11–T15 du README de la branche (dont T15 : désinstaller / réinstaller sans recharger →
   deux hooks, une seule annonce).
