#!/bin/sh
# Produit dist/whichprofile-<version>.zip pour le Chrome Web Store. Sans npm, sans dépendance.
#
#   sh scripts/pack.sh
#
# 1. lance les tests (abandon s'ils échouent) ;
# 2. zippe l'extension avec manifest.json à la racine, sans les fichiers de développement ;
# 3. vérifie que chaque fichier référencé par le manifest est dans le zip.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

VERSION=$(node -p "require('./manifest.json').version")
OUT="dist/whichprofile-$VERSION.zip"

echo "→ tests"
node --test >/dev/null 2>&1 || { echo "Échec des tests : lancer « node --test » pour le détail. Paquet non produit." >&2; exit 1; }

echo "→ $OUT"
mkdir -p dist
rm -f "$OUT"
# Exclus : dépôt git, tests, scripts, docs internes, textes Store (servent au formulaire, pas à l'extension),
# sorties de build, visuels du README (docs/), source SVG des icônes, fichiers cachés (.gitignore, .DS_Store).
zip -q -r -X "$OUT" . \
  -x '.*' -x '*/.*' \
  -x 'test/*' -x 'scripts/*' -x 'dist/*' -x 'store/*' -x 'docs/*' -x 'node_modules/*' -x 'icons/*.svg' \
  -x 'CLAUDE.md' -x 'README.md'

echo "→ vérification"
LIST=$(unzip -Z1 "$OUT")
MISSING=$(node -e '
  const m = require("./manifest.json");
  const files = [
    m.background.service_worker, m.action.default_popup, m.options_ui.page, "offscreen.html",
    ...Object.values(m.icons), ...Object.values(m.action.default_icon),
    ...m.content_scripts.flatMap((c) => c.js),
    `_locales/${m.default_locale}/messages.json`,
    "lib/chip.js", "agent/chip.js", // Agent mode : enregistrés dynamiquement, hors manifest
    "lib/sites.js", "lib/config.js", "lib/i18n.js", "lib/route.js", "lib/reinject.js", // chargés par importScripts / <script>
    "ui/tokens.css", "ui/components.css", "ui/fonts/BricolageGrotesque.woff2", "ui/fonts/OFL.txt", // identité v1.0.2
    "options.css", "popup.css", "LICENSE",
  ];
  const zipped = new Set(process.argv[1].split("\n"));
  console.log(files.filter((f) => !zipped.has(f)).join(" "));
' "$LIST")
if [ -n "$MISSING" ]; then
  echo "Fichiers manquants dans le zip : $MISSING" >&2
  exit 1
fi
FORBIDDEN=$(printf '%s\n' "$LIST" | grep -E '^(\.git/|test/|scripts/|dist/|store/|docs/|node_modules/|CLAUDE\.md$|README\.md$)|/\.|^\.' || true)
if [ -n "$FORBIDDEN" ]; then
  echo "Fichiers qui ne devraient pas être dans le zip : $FORBIDDEN" >&2
  exit 1
fi

COUNT=$(printf '%s\n' "$LIST" | grep -vc '/$')
SIZE=$(du -k "$OUT" | cut -f1)
if [ "$SIZE" -ge 1024 ]; then
  echo "Zip trop gros : ${SIZE} Ko (limite 1 Mo)" >&2
  exit 1
fi
echo "OK : $OUT — $COUNT fichiers, ${SIZE} Ko"
