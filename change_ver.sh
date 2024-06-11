#!/bin/bash

# This will change the version used in iframeable HTML files and also version
# directories. Note that you still have to change the version environment
# variable in CodeKit.

# Define the version strings.
old_version="v3.2.1"
new_version="v3.2.2"

# Find and rename directories, but skip the .git directory.
for file in $(find . -not -path "./.git/*" -type d -name "$old_version"); do
  mv $file $(dirname $file)/$new_version
done

# Find and replace the search string in all files recursively.
find . -type f -name "*.html" -exec sed -i '' -e "s/$old_version\/gewa/$new_version\/gewa/g" {} +

echo "Change complete."
