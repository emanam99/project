/**
 * Cek cepat kesiapan PWA/TWA untuk nailul-murod.alutsmani.id tanpa JDK/Android SDK.
 * Jalankan: npm run twa:preflight
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')

const ORIGIN = 'https://nailul-murod.alutsmani.id'
const MANIFEST_PATH = '/manifest.webmanifest'

function fail(msg) {
  console.error('\x1b[31m✖\x1b[0m', msg)
  process.exitCode = 1
}

function ok(msg) {
  console.log('\x1b[32m✔\x1b[0m', msg)
}

function warn(msg) {
  console.log('\x1b[33m!\x1b[0m', msg)
}

async function fetchJson(url) {
  const res = await fetch(url, { redirect: 'follow' })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Respons bukan JSON')
  }
}

async function main() {
  console.log('Preflight TWA / PWA —', ORIGIN, '\n')

  const manifestUrl = new URL(MANIFEST_PATH, ORIGIN).href
  let manifest
  try {
    manifest = await fetchJson(manifestUrl)
  } catch (e) {
    fail(`Gagal memuat manifest: ${manifestUrl} — ${e.message}`)
    return
  }
  ok(`Manifest: ${manifestUrl}`)

  const display = manifest.display || ''
  if (display === 'minimal-ui') {
    ok(`display: "${display}" (selaras manifest repo / PWA terpasang)`)
  } else if (display === 'standalone' || display === 'fullscreen') {
    warn(
      `display: "${display}" — repo memakai "minimal-ui"; deploy ulang manifest dari build terbaru bila ini lingkungan produksi.`,
    )
  } else {
    warn(`display: "${display}" — diharapkan "minimal-ui" (sesuai public/manifest.webmanifest).`)
  }

  const start = manifest.start_url || '/'
  ok(`start_url: ${JSON.stringify(start)}`)

  const icons = manifest.icons || []
  const sizes = new Set()
  for (const ic of icons) {
    for (const s of String(ic.sizes || '').split(/\s+/)) {
      const w = parseInt(s.split('x')[0], 10)
      if (!Number.isNaN(w)) sizes.add(w)
    }
  }
  if (sizes.has(512)) {
    ok('icons: ada entri 512px (Bubblewrap butuh ikon besar)')
  } else {
    warn('icons: tidak terdeteksi ukuran 512px — pastikan manifest punya ikon ≥512px.')
  }
  if (sizes.has(192)) {
    ok('icons: ada entri 192px')
  } else {
    warn('icons: tidak terdeteksi 192px')
  }

  const scope = manifest.scope || '/'
  ok(`scope: ${JSON.stringify(scope)}`)

  const twaManifestPath = join(REPO_ROOT, 'twa-playstore', 'twa-manifest.json')
  let twa
  try {
    const raw = await readFile(twaManifestPath, 'utf8')
    twa = JSON.parse(raw)
  } catch {
    warn(`Tidak bisa membaca ${twaManifestPath}`)
  }
  if (twa) {
    if (twa.host === new URL(ORIGIN).host) {
      ok(`twa-manifest host sama dengan origin (${twa.host})`)
    } else {
      warn(`twa-manifest host "${twa.host}" ≠ origin — sesuaikan bila perlu.`)
    }
    if (twa.packageId) {
      ok(`twa-manifest packageId: ${twa.packageId}`)
    }
  }

  const assetUrl = new URL('/.well-known/assetlinks.json', ORIGIN).href
  try {
    const res = await fetch(assetUrl, { redirect: 'follow' })
    const raw = await res.text()
    if (res.ok) {
      let j = null
      try {
        j = JSON.parse(raw)
      } catch {
        warn(`assetlinks.json: URL mengembalikan non-JSON (kemungkinan halaman HTML/404) — ${assetUrl}`)
      }
      if (j !== null) {
        const str = JSON.stringify(j)
        if (str.includes(twa?.packageId || 'com.alutsmani.nailul_murod.twa')) {
          ok(`assetlinks.json ditemukan dan menyebut packageId (${assetUrl})`)
        } else {
          warn(
            `assetlinks.json ada (${res.status}) tetapi tidak jelas memuat packageId yang dipakai TWA — periksa isi.`,
          )
        }
      }
    } else {
      warn(`assetlinks.json: ${res.status} (${assetUrl}) — unggah setelah keystore & SHA-256.`)
    }
  } catch (e) {
    warn(`assetlinks.json: tidak bisa diunduh (${e.message})`)
  }

  console.log(
    '\nSelesai. Untuk validasi resmi Google jalankan `npm run twa:validate` setelah JDK 17 + Android SDK + %USERPROFILE%\\.bubblewrap\\config.json siap.',
  )
}

main().catch((e) => {
  fail(e.message || String(e))
})
