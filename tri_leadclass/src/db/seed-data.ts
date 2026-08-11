// Kategori awal (bukan artikel). Artikel hanya dari naskah yang diterbitkan admin.
export const CATEGORIES: string[] = [];

export interface SeedArticle {
  title: string;
  excerpt: string;
  category: string;
  author: string;
  authorRole: string;
  date: string;
  publishedAt: string;
  readTime: string;
  image: string;
  content: string;
  featured?: boolean;
}

/** Kosong — tidak ada artikel demo. */
export const ARTICLES: SeedArticle[] = [];
