#!/bin/bash
# Linux: run or make a desktop launcher for this file to open NYTimes.com via your library pass.
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || npm run setup
node nyt-pass.js
