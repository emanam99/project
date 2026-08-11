import type { APIRoute } from 'astro'

export const prerender = false

/** Liveness probe sederhana untuk Docker / Nginx upstream. */
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
