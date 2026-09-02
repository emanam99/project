#!/usr/bin/env bash
# Hanya untuk Cursor Cloud Agents (bukan PC lokal / XAMPP).
# Menulis .env frontend ke API staging dan memasang dependensi Vite.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ALU="$ROOT/alutsmani"
API_URL="${CURSOR_STAGING_API_URL:-https://api.alutsmani.my.id/api}"
GAMBAR_BASE="${CURSOR_STAGING_GAMBAR_URL:-https://gambar.alutsmani.id}"
EBEDDIEN_URL="${CURSOR_STAGING_EBEDDIEN_URL:-https://ebeddien.alutsmani.my.id}"
MYBEDDIEN_URL="${CURSOR_STAGING_MYBEDDIEN_URL:-https://mybeddien.alutsmani.my.id}"

if [[ ! -d "$ALU" ]]; then
  echo "[cursor-cloud] folder alutsmani/ tidak ditemukan di $ROOT" >&2
  exit 1
fi

write_env() {
  local dest="$1"
  shift
  mkdir -p "$(dirname "$dest")"
  printf '%s\n' "$@" > "$dest"
}

write_env "$ALU/ebeddien/.env" \
  "VITE_API_BASE_URL=${API_URL}" \
  "VITE_APP_ENV=staging" \
  "VITE_APP_BASE=/" \
  "VITE_GAMBAR_BASE=${GAMBAR_BASE}" \
  "VITE_MYBEDDIEN_APP_URL=${MYBEDDIEN_URL}"

write_env "$ALU/mybeddien/.env" \
  "VITE_API_BASE_URL=${API_URL}" \
  "VITE_APP_ENV=staging" \
  "VITE_GAMBAR_BASE=${GAMBAR_BASE}" \
  "VITE_EBEDDien_APP_URL=${EBEDDIEN_URL}"

write_env "$ALU/daftar/.env" \
  "VITE_API_BASE=/api" \
  "VITE_API_BASE_URL=${API_URL}" \
  "VITE_APP_ENV=staging" \
  "VITE_GAMBAR_BASE=${GAMBAR_BASE}"

install_app() {
  local dir="$1"
  echo "[cursor-cloud] npm di alutsmani/${dir}"
  cd "$ALU/$dir"
  if [[ -f package-lock.json ]]; then
    npm ci --no-audit --no-fund || npm install --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
}

install_app ebeddien
install_app mybeddien
install_app daftar

echo "[cursor-cloud] siap. API staging: ${API_URL}"
