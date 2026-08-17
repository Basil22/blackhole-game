#!/bin/bash
# build-www.sh — copies static web assets into www/ for Capacitor packaging.
# No bundler needed — the game is pure ES modules served statically.
set -euo pipefail

WWW="www"
ROOT="$(cd "$(dirname "$0")" && pwd)"

rm -rf "$ROOT/$WWW"
mkdir -p "$ROOT/$WWW"

# Core files
cp "$ROOT/index.html" "$ROOT/$WWW/"
cp "$ROOT/manifest.webmanifest" "$ROOT/$WWW/"
cp "$ROOT/favicon.ico" "$ROOT/$WWW/"

# CSS
cp -r "$ROOT/css" "$ROOT/$WWW/css"

# JS — copy everything (ES modules with relative paths)
cp -r "$ROOT/js" "$ROOT/$WWW/js"

# Assets (icons)
cp -r "$ROOT/assets" "$ROOT/$WWW/assets" 2>/dev/null || true

echo "Built www/ with $(find "$ROOT/$WWW" -type f | wc -l) files"
