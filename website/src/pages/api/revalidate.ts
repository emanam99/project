import type { APIRoute } from 'astro'

export const prerender = false

/**
 * Endpoint webhook opsional dari admin (eBeddien) atau cron untuk memicu rebuild/cache bust.
 * Implementasi nyata bergantung target deployment (Astro hybrid Node tidak punya cache built-in seperti Next ISR).
 * Di sini sekadar mengakui request dengan secret cocok; gunakan sebagai sinyal eksternal (mis. trigger CI rebuild).
 */
export const POST: APIRoute = async ({ request }) => {
  const expected = (import.meta as any).env?.REVALIDATE_SECRET || process.env.REVALIDATE_SECRET || ''
  const auth = request.headers.get('x-revalidate-secret') || new URL(request.url).searchParams.get('secret') || ''
  if (expected && auth !== expected) {
    return new Response(JSON.stringify({ ok: false, message: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
