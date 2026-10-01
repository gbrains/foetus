#!/bin/bash
# macOS: double-click this file (or drag it to the Dock) to open NYTimes.com via your library pass.
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || npm run setup
node nyt-pass.js
