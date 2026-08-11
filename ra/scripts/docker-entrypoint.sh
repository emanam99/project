#!/bin/sh
# Profil WA dipakai bersama host + container (bind mount). Chromium menulis SingletonLock
# dengan hostname host -> container gagal start. Hapus kunci stale sebelum proses baru
# (aman saat tidak ada Chromium lain yang sedang jalan untuk folder ini).
set -e
SESSION_ROOT="/app/data/whatsapp-session/session"
if [ -d "$SESSION_ROOT" ]; then
  rm -f "$SESSION_ROOT/SingletonLock" "$SESSION_ROOT/SingletonSocket" "$SESSION_ROOT/SingletonCookie" 2>/dev/null || true
fi
exec "$@"
