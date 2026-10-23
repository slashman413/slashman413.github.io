#!/usr/bin/env bash
# Build once, then publish the same dist/ to both static copies:
#   slashman413.github.io/static/line-chat-generator   → slashmantools.us/line-chat-generator/
#   ckw19810413.github.io/static/line-chat-generator   → ckw19810413.github.io/line-chat-generator/
# Commit and push each repo afterwards.
set -euo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$(cd "$APP/../.." && pwd)"
CKW="${CKW_REPO:-$HOME/workspace/github/ckw19810413/ckw19810413.github.io}"

cd "$APP"
npm ci --no-audit --no-fund
npm run build

for dest in "$SITE/static/line-chat-generator" "$CKW/static/line-chat-generator"; do
  if [ ! -d "$(dirname "$dest")" ]; then echo "skip (missing): $dest"; continue; fi
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R dist/. "$dest/"
  echo "published → $dest"
done
