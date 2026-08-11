#!/bin/bash
set -euo pipefail
BACKUP_DIR="$HOME/private_backups"
echo "=== wipe private_backups ==="
ls -la "$BACKUP_DIR" 2>/dev/null || true
rm -f "$BACKUP_DIR"/api.env.backup-*
rm -f "$BACKUP_DIR"/api-error-*.log
rm -f "$BACKUP_DIR"/api2-error-*.log
rm -f "$BACKUP_DIR"/db.sql.removed-*
rm -f "$BACKUP_DIR"/gen-lang-client-*.json
# remove empty leftover files
find "$BACKUP_DIR" -type f -delete 2>/dev/null || true
echo "remaining:"
ls -la "$BACKUP_DIR" 2>/dev/null || echo "(dir missing)"
echo "DONE_WIPE"
