export interface Book {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  cover_key: string | null;
  file_key: string | null;
  file_type: string;
  file_size: number | null;
  language: string;
  publisher: string | null;
  publish_date: string | null;
  isbn: string | null;
  added_at: string;
  updated_at: string;
  shelves?: Shelf[];
}

export interface BookWithProgress extends Book {
  progress_percent: number | null;
  current_chapter: string | null;
  last_read_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  shelf_ids: string | null;
}

export interface Shelf {
  id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  created_at: string;
  book_count: number;
}

export interface ReadingProgress {
  book_id: string;
  current_cfi: string | null;
  current_chapter: string | null;
  progress_percent: number;
  current_page: number | null;
  total_pages: number | null;
  started_at: string | null;
  finished_at: string | null;
  last_read_at: string;
}

export interface Bookmark {
  id: string;
  book_id: string;
  cfi: string;
  label: string | null;
  color: string;
  created_at: string;
}

export interface Review {
  id: string;
  book_id: string;
  rating: number | null;
  review_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface Annotation {
  id: string;
  book_id: string;
  cfi_range: string;
  selected_text: string | null;
  comment: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Stats {
  total_books: number;
  currently_reading: number;
  finished: number;
  reviewed: number;
  average_rating: number | null;
}

export interface BookClubRound {
  id: string;
  status: 'open' | 'reading' | 'finished';
  winning_recommendation_id: string | null;
  created_at: string;
  finished_at: string | null;
  winner?: Recommendation | null;
}

export interface Recommendation {
  id: string;
  round_id: string;
  book_id: string | null;
  title: string;
  author: string | null;
  cover_url: string | null;
  recommended_by: string;
  pitch: string | null;
  votes: string[];
  vote_count: number;
  created_at: string;
}

export interface BookClubData {
  round: BookClubRound | null;
  recommendations: Recommendation[];
}
