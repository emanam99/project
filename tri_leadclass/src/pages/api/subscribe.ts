import type { APIRoute } from 'astro';
import { addSubscriber } from '../../lib/articles.ts';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/subscribe  { "email": "..." }
export const POST: APIRoute = async ({ request }) => {
  let email: unknown;
  try {
    const body = await request.json();
    email = body?.email;
  } catch {
    return json({ error: 'Body JSON tidak valid.' }, 400);
  }

  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return json({ error: 'Alamat surel tidak valid.' }, 400);
  }

  const normalized = email.trim().toLowerCase();
  const result = addSubscriber(normalized);

  if (result === 'exists') {
    return json({ message: 'Surel ini sudah terdaftar. Terima kasih!' }, 200);
  }
  return json({ message: 'Berhasil berlangganan notifikasi terbitan!' }, 201);
};

function json(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
