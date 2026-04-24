#!/bin/bash

# This will change the version used in iframeable HTML files and also version
# directories. Note that you still have to change the version environment
# variable in CodeKit, and update the CodeKit output paths to shared/v{new}/.

# Define the version strings.
old_version="v4.0.1"
new_version="v4.0.2"

# Find and rename directories under shared/, but skip .git.
for file in $(find . -not -path "./.git/*" -type d -name "$old_version"); do
  mv $file $(dirname $file)/$new_version
done

# Find and replace the version string in all HTML files recursively.
find . -type f -name "*.html" -exec sed -i '' -e "s|/shared/$old_version/|/shared/$new_version/|g" {} +

echo "Change complete. Also update GEWA_VERSION in CodeKit => Project Settings => Environment Variables."
