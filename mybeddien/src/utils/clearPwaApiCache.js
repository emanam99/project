/** Hapus cache Workbox api-cache saat logout agar respons API sensitif tidak tertinggal. */
export async function clearPwaApiCache() {
  if (typeof caches === 'undefined') return
  try {
    await caches.delete('api-cache')
  } catch {
    /* abaikan */
  }
}
