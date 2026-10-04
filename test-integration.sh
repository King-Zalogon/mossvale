#!/bin/sh
cd "$(dirname "$0")" || exit 1
exec node scripts/local-integration.mjs "$@"
