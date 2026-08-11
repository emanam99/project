import type { APIRoute } from 'astro';

export const prerender = false;

// Health check untuk Docker/Traefik.
export const GET: APIRoute = () =>
  new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });
