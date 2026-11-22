#!/bin/bash
# Builds the ZIP that is uploaded to the Chrome Web Store.
# Only the files Chrome needs to run the extension go in; the site check, the
# store materials, the docs and the agent skills stay out.
set -euo pipefail

cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
output="dist/list-stickers-v${version}.zip"
rm -f "$output"

zip -q -r "$output" \
  manifest.json background.js content.js \
  popup.html popup.js options.html options.js \
  icons \
  -x "*.DS_Store"

echo "Packaged $output ($(du -h "$output" | cut -f1 | tr -d ' '))"
unzip -l "$output"
