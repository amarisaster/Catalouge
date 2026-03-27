import { useState, useEffect } from 'react';
import { getBooks, getShelves, getStats } from '../api';
import type { BookWithProgress, Shelf, Stats } from '../types';
import BookCard from '../components/BookCard';
import UploadModal from '../components/UploadModal';
import EmptyState from '../components/EmptyState';

export default function Library() {
  const [books, setBooks] = useState<BookWithProgress[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeShelf, setActiveShelf] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadBooks();
  }, [activeShelf, search]);

  async function loadData() {
    try {
      const [s, st] = await Promise.all([getShelves(), getStats()]);
      setShelves(s);
      setStats(st);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  async function loadBooks() {
    setLoading(true);
    try {
      const params: { shelf?: string; search?: string } = {};
      if (activeShelf !== 'all') params.shelf = activeShelf;
      if (search) params.search = search;
      const b = await getBooks(params);
      setBooks(b);
    } catch (err) {
      console.error('Failed to load books:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Welcome header with stats */}
      {stats && (
        <div className="mb-6 animate-fade-in">
          <h1 className="text-2xl font-bold text-bark-700 dark:text-cream-200">
            My Library
          </h1>
          <div className="flex gap-4 mt-2 flex-wrap">
            <StatChip icon="📚" label="Books" value={stats.total_books} />
            <StatChip icon="📖" label="Reading" value={stats.currently_reading} />
            <StatChip icon="✅" label="Finished" value={stats.finished} />
            {stats.average_rating && (
              <StatChip icon="⭐" label="Avg Rating" value={stats.average_rating.toFixed(1)} />
            )}
          </div>
        </div>
      )}

      {/* Shelf tabs + Search + Upload */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Shelf pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
          <ShelfPill
            active={activeShelf === 'all'}
            onClick={() => setActiveShelf('all')}
          >
            All
          </ShelfPill>
          {shelves.map((s) => (
            <ShelfPill
              key={s.id}
              active={activeShelf === s.id}
              onClick={() => setActiveShelf(s.id)}
            >
              {s.icon} {s.name}
              {s.book_count > 0 && (
                <span className="ml-1 text-xs opacity-60">{s.book_count}</span>
              )}
            </ShelfPill>
          ))}
        </div>

        {/* Search + Upload */}
        <div className="flex gap-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bark-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="cozy-input pl-9 w-48"
            />
          </div>
          <button className="btn-primary whitespace-nowrap" onClick={() => setShowUpload(true)}>
            + Add Book
          </button>
        </div>
      </div>

      {/* Book grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <img src="/neko-playing.png" alt="Loading" className="w-24 h-24 object-contain neko-bounce" />
          <p className="text-sm text-bark-400 dark:text-cream-400 mt-2">Loading your books...</p>
        </div>
      ) : books.length === 0 ? (
        <EmptyState
          title={search ? 'No books found' : 'Your library is empty'}
          subtitle={search ? 'Try a different search term' : 'Add your first book to get started!'}
          action={
            !search && (
              <button className="btn-primary" onClick={() => setShowUpload(true)}>
                + Add your first book
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}

      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={() => {
          loadBooks();
          loadData();
        }}
      />
    </div>
  );
}

function StatChip({ icon, label, value }: { icon: string; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-bark-500 dark:text-cream-400">
      <span>{icon}</span>
      <span className="font-bold text-bark-700 dark:text-cream-200">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function ShelfPill({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all border-none cursor-pointer font-[inherit]
        ${active
          ? 'bg-rose text-white shadow-sm'
          : 'bg-cream-200 dark:bg-bark-600 text-bark-400 dark:text-cream-400 hover:bg-cream-300 dark:hover:bg-bark-500'
        }
      `}
    >
      {children}
    </button>
  );
}
