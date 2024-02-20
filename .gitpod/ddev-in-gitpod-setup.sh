#!/usr/bin/env bash
if [ -n "$DEBUG_SCRIPTS" ] || [ -n "$GITPOD_HEADLESS" ]; then
    set -x
fi

# Misc housekeeping before start
ddev config global --web-environment-add="TERMINUS_MACHINE_TOKEN=$PANTHEON_TERMINUS_TOKEN"