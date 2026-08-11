import type { APIRoute } from 'astro';
import { listArticles, searchArticles, getArticlesByCategory } from '../../lib/articles.ts';

export const prerender = false;

// GET /api/articles?q=...&category=...&limit=...
export const GET: APIRoute = ({ url }) => {
  const q = url.searchParams.get('q')?.trim();
  const category = url.searchParams.get('category')?.trim();
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100);

  let data;
  if (q) {
    data = searchArticles(q, limit);
  } else if (category) {
    data = getArticlesByCategory(category);
  } else {
    data = listArticles(limit);
  }

  return new Response(JSON.stringify({ count: data.length, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
