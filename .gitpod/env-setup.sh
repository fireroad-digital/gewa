#!/usr/bin/env bash
if [ -n "$DEBUG_SCRIPTS" ]; then
    set -x
fi

if [ -n "$GITPOD_HEADLESS" ]; then
    # Fetch PANTHEON_SSH_KEY value during `init`
    eval "$(gp env -e)" > /dev/null
fi

# Setting SSH key from environment variable
mkdir -p ~/.ssh
printenv PANTHEON_SSH_KEY > ~/.ssh/id_rsa
chmod 600 ~/.ssh/id_rsa

# Login to terminus
terminus auth:login --email=$PANTHEON_EMAIL --machine-token=$PANTHEON_TERMINUS_TOKEN

# Get the latest frush.yml
mkdir -p ~/.frush
curl -L \
-H "Authorization: token ${FIREPOD_GITHUB_TOKEN}" \
-H 'Accept: application/vnd.github.v3.raw' \
-o ~/.frush/frush.yml \
https://api.github.com/repos/fireroad-digital/frush/contents/frush.yml