import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getBook, getShelves, getProgress, getReview, saveReview,
  addBookToShelf, removeBookFromShelf, deleteBook,
  getBookCoverUrl,
} from '../api';
import type { Book, Shelf, ReadingProgress, Review } from '../types';

export default function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [bookShelves, setBookShelves] = useState<string[]>([]);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [, setReview] = useState<Review | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    loadBook();
  }, [id]);

  async function loadBook() {
    setLoading(true);
    try {
      const [b, s, p, r] = await Promise.all([
        getBook(id!),
        getShelves(),
        getProgress(id!).catch(() => null),
        getReview(id!),
      ]);
      setBook(b);
      setShelves(s);
      setProgress(p);
      setReview(r);
      if (r) {
        setRating(r.rating ?? 0);
        setReviewText(r.review_text ?? '');
      }
      if (b.shelves) {
        setBookShelves(b.shelves.map((sh) => sh.id));
      }
    } finally {
      setLoading(false);
    }
  }

  async function toggleShelf(shelfId: string) {
    if (!id) return;
    if (bookShelves.includes(shelfId)) {
      await removeBookFromShelf(id, shelfId);
      setBookShelves((prev) => prev.filter((s) => s !== shelfId));
    } else {
      await addBookToShelf(id, shelfId);
      setBookShelves((prev) => [...prev, shelfId]);
    }
  }

  async function handleSaveReview() {
    if (!id) return;
    const r = await saveReview(id, {
      rating: rating || undefined,
      review_text: reviewText || undefined,
    });
    setReview(r);
  }

  async function handleDelete() {
    if (!id) return;
    await deleteBook(id);
    navigate('/');
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-rose border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="text-center py-16">
        <p className="text-bark-400">Book not found</p>
        <Link to="/" className="text-rose font-semibold mt-2 inline-block">
          Back to library
        </Link>
      </div>
    );
  }

  const progressPercent = progress?.progress_percent ?? 0;

  return (
    <div className="animate-fade-in">
      {/* Back button */}
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-bark-400 dark:text-cream-400 hover:text-rose no-underline mb-6"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to library
      </Link>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Cover */}
        <div className="w-full md:w-64 shrink-0">
          <div className="aspect-[2/3] rounded-2xl overflow-hidden shadow-lg">
            {book.cover_key ? (
              <img
                src={getBookCoverUrl(book.id)}
                alt={book.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="cover-placeholder w-full h-full">
                <div className="text-5xl">📖</div>
              </div>
            )}
          </div>

          {/* Read button */}
          {book.file_key && book.file_type === 'epub' && (
            <Link
              to={`/read/${book.id}`}
              className="btn-primary w-full mt-4 text-center block no-underline"
            >
              {progressPercent > 0 ? 'Continue Reading' : 'Start Reading'}
            </Link>
          )}
          {book.file_key && book.file_type === 'pdf' && (
            <Link
              to={`/read/${book.id}`}
              className="btn-primary w-full mt-4 text-center block no-underline"
            >
              Open PDF
            </Link>
          )}

          {/* Progress */}
          {progressPercent > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-bark-400 dark:text-cream-400 mb-1">
                <span>{Math.round(progressPercent)}% complete</span>
                {progress?.current_chapter && (
                  <span className="truncate ml-2">{progress.current_chapter}</span>
                )}
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-bark-600 dark:text-cream-200">
            {book.title}
          </h1>
          {book.author && (
            <p className="text-bark-400 dark:text-cream-400 mt-1">by {book.author}</p>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap gap-2 mt-4">
            {book.language && <MetaBadge label="Language" value={book.language.toUpperCase()} />}
            {book.publisher && <MetaBadge label="Publisher" value={book.publisher} />}
            {book.publish_date && <MetaBadge label="Published" value={book.publish_date} />}
            {book.isbn && <MetaBadge label="ISBN" value={book.isbn} />}
            <MetaBadge label="Format" value={book.file_type.toUpperCase()} />
            {book.file_size && <MetaBadge label="Size" value={formatSize(book.file_size)} />}
          </div>

          {/* Description */}
          {book.description && (
            <div className="mt-6">
              <h3 className="text-sm font-bold text-bark-500 dark:text-cream-300 mb-2">
                Description
              </h3>
              <p className="text-sm text-bark-400 dark:text-cream-400 leading-relaxed">
                {book.description}
              </p>
            </div>
          )}

          {/* Shelves */}
          <div className="mt-6">
            <h3 className="text-sm font-bold text-bark-500 dark:text-cream-300 mb-2">
              Shelves
            </h3>
            <div className="flex flex-wrap gap-2">
              {shelves.map((shelf) => (
                <button
                  key={shelf.id}
                  onClick={() => toggleShelf(shelf.id)}
                  className={`
                    px-3 py-1.5 rounded-full text-xs font-semibold transition-all border-none cursor-pointer font-[inherit]
                    ${bookShelves.includes(shelf.id)
                      ? 'bg-rose text-white'
                      : 'bg-cream-200 dark:bg-bark-600 text-bark-400 dark:text-cream-400 hover:bg-cream-300'
                    }
                  `}
                >
                  {shelf.icon} {shelf.name}
                </button>
              ))}
            </div>
          </div>

          {/* Review */}
          <div className="mt-6 cozy-card p-4">
            <h3 className="text-sm font-bold text-bark-500 dark:text-cream-300 mb-3">
              Your Review
            </h3>

            {/* Star rating */}
            <div className="star-rating flex gap-1 mb-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star === rating ? 0 : star)}
                  className={star <= rating ? 'text-honey' : 'text-cream-300 dark:text-bark-500'}
                >
                  ★
                </button>
              ))}
            </div>

            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Write your thoughts..."
              rows={3}
              className="cozy-input resize-none"
            />

            <div className="flex justify-end mt-3">
              <button className="btn-primary text-xs" onClick={handleSaveReview}>
                Save Review
              </button>
            </div>
          </div>

          {/* Danger zone */}
          <div className="mt-8 pt-6 border-t border-cream-300 dark:border-bark-600">
            {showDelete ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-bark-400">Delete this book permanently?</span>
                <button
                  className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-500 text-white border-none cursor-pointer"
                  onClick={handleDelete}
                >
                  Yes, delete
                </button>
                <button
                  className="btn-secondary text-xs"
                  onClick={() => setShowDelete(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="text-xs text-bark-300 hover:text-red-500 transition-colors bg-transparent border-none cursor-pointer font-[inherit]"
                onClick={() => setShowDelete(true)}
              >
                Delete this book
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="shelf-badge">
      <span className="opacity-60">{label}:</span> {value}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
