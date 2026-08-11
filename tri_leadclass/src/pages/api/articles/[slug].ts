import type { APIRoute } from 'astro';
import { getArticleBySlug } from '../../../lib/articles.ts';

export const prerender = false;

// GET /api/articles/:slug
export const GET: APIRoute = ({ params }) => {
  const slug = params.slug;
  const article = slug ? getArticleBySlug(slug) : undefined;

  if (!article) {
    return new Response(JSON.stringify({ error: 'Artikel tidak ditemukan' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ data: article }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
