#!/bin/bash
# Usage: ./release.sh v4.0.5
new_version="$1"
if [ -z "$new_version" ]; then
  echo "Usage: $0 <new-version>  (e.g. ./release.sh v4.0.5)"
  exit 1
fi

find . -not -path "./.git/*" -type f -name "*.html" \
  -exec sed -i '' -e "s|\.css?v=[^\"']*|.css?v=$new_version|g" {} + \
  -exec sed -i '' -e "s|\.js?v=[^\"']*|.js?v=$new_version|g" {} +

echo "Updated all HTML files to $new_version."
echo "Commit with: git add -A && git commit -m \"Bump to $new_version\""
