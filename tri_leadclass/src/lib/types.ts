export interface Category {
  id: number;
  slug: string;
  name: string;
}

export interface Author {
  id: number;
  name: string;
  role: string | null;
}

export interface Article {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  image: string | null;
  read_time: string | null;
  featured: number;
  views: number;
  published_at: string | null;
  created_at: string;
  category_slug: string | null;
  category_name: string | null;
  author_name: string | null;
  author_role: string | null;
}

export type UserRole = 'super_admin' | 'admin' | 'user';

export interface User {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  google_id: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export type ManuscriptStatus =
  | 'pending'
  | 'reviewing'
  | 'revision'
  | 'accepted'
  | 'rejected'
  | 'published';

export interface Manuscript {
  id: number;
  user_id: number;
  title: string;
  abstract: string;
  keywords: string | null;
  category: string | null;
  author_notes: string | null;
  file_path: string | null;
  cover_image_path: string | null;
  status: ManuscriptStatus;
  admin_notes: string | null;
  reviewed_by: number | null;
  article_id: number | null;
  created_at: string;
  updated_at: string;
  submitter_name?: string | null;
  submitter_email?: string | null;
  reviewer_name?: string | null;
  article_slug?: string | null;
  article_views?: number | null;
}

export interface UserAuthorProfile {
  user_id: number;
  title_prefix: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  title_suffix: string | null;
  id_number: string | null;
  phone: string | null;
  institution: string | null;
  position_status: string | null;
  photo_path: string | null;
  updated_at: string;
}

export interface Contributor {
  id: number;
  user_id: number | null;
  slug: string;
  title_prefix: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  title_suffix: string | null;
  id_number: string | null;
  email: string;
  phone: string | null;
  institution: string | null;
  position_status: string | null;
  photo_path: string | null;
  google_picture: string | null;
  created_at: string;
}

export interface SitePage {
  id: number;
  slug: string;
  title: string;
  section: 'journal' | 'policy';
  excerpt: string | null;
  content: string;
  sort_order: number;
  updated_at: string;
}

export interface EditorialBoardMember {
  id: number;
  user_id: number | null;
  slug: string;
  sort_order: number;
  editorial_role: string | null;
  title_prefix: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  title_suffix: string | null;
  id_number: string | null;
  email: string | null;
  phone: string | null;
  institution: string | null;
  position_status: string | null;
  photo_path: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}
