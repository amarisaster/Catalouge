-- Catalouge: Mai's Personal Library
-- D1 Schema v1.0.0

-- Books: core metadata
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  description TEXT,
  cover_key TEXT,
  file_key TEXT,
  file_type TEXT NOT NULL DEFAULT 'epub',
  file_size INTEGER,
  language TEXT DEFAULT 'en',
  publisher TEXT,
  publish_date TEXT,
  isbn TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Shelves: categorization
CREATE TABLE IF NOT EXISTS shelves (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Book-Shelf relationship (many-to-many)
CREATE TABLE IF NOT EXISTS book_shelves (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (book_id, shelf_id)
);

-- Reading progress
CREATE TABLE IF NOT EXISTS reading_progress (
  book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  current_cfi TEXT,
  current_chapter TEXT,
  progress_percent REAL DEFAULT 0,
  current_page INTEGER,
  total_pages INTEGER,
  started_at TEXT,
  finished_at TEXT,
  last_read_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  cfi TEXT NOT NULL,
  label TEXT,
  color TEXT DEFAULT '#d4748a',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reviews/notes
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL UNIQUE REFERENCES books(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Annotations (highlights with comments)
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  cfi_range TEXT NOT NULL,
  selected_text TEXT,
  comment TEXT,
  color TEXT DEFAULT '#d4748a',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS book_tags (
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);

-- Book club rounds
CREATE TABLE IF NOT EXISTS book_club_rounds (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reading', 'finished')),
  winning_recommendation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

-- Recommendations within a round
CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES book_club_rounds(id) ON DELETE CASCADE,
  book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  author TEXT,
  cover_url TEXT,
  recommended_by TEXT NOT NULL,
  pitch TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Votes on recommendations
CREATE TABLE IF NOT EXISTS recommendation_votes (
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  voter TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (recommendation_id, voter)
);

-- Seed default shelves
INSERT OR IGNORE INTO shelves (id, name, icon, sort_order) VALUES
  ('reading', 'Currently Reading', '📖', 1),
  ('want-to-read', 'To Be Read', '📋', 2),
  ('finished', 'Finished', '✅', 3),
  ('dnf', 'Did Not Finish', '🚫', 4),
  ('favorites', 'Favorites', '⭐', 5);
