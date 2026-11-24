#!/bin/sh
# Nightly backup wrapper. Run from the project folder: ./scripts/backup.sh [backupDir]
cd "$(dirname "$0")/.." && exec node scripts/backup.mjs "$@"
