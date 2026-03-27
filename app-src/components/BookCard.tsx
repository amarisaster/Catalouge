import { Link } from 'react-router-dom';
import type { BookWithProgress } from '../types';
import { getBookCoverUrl } from '../api';

interface BookCardProps {
  book: BookWithProgress;
}

export default function BookCard({ book }: BookCardProps) {
  const progress = book.progress_percent ?? 0;
  const shelves = book.shelf_ids?.split(',') ?? [];

  return (
    <Link
      to={`/book/${book.id}`}
      className="cozy-card overflow-hidden no-underline text-inherit block animate-fade-in"
    >
      {/* Cover */}
      <div className="aspect-[2/3] relative overflow-hidden rounded-t-[1.25rem]">
        {book.cover_key ? (
          <img
            src={getBookCoverUrl(book.id)}
            alt={book.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="cover-placeholder w-full h-full">
            <div className="text-center p-4">
              <div className="text-3xl mb-2">📖</div>
              <div className="text-xs font-semibold text-bark-400 dark:text-cream-400 line-clamp-2">
                {book.title}
              </div>
            </div>
          </div>
        )}

        {/* Progress overlay */}
        {progress > 0 && progress < 100 && (
          <div className="absolute bottom-0 left-0 right-0">
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Finished badge */}
        {shelves.includes('finished') && (
          <div className="absolute top-2 right-2 bg-sage/90 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            Done
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm font-bold leading-snug line-clamp-2 text-bark-600 dark:text-cream-200">
          {book.title}
        </h3>
        {book.author && (
          <p className="text-xs text-bark-300 dark:text-bark-200 mt-1 line-clamp-1">
            {book.author}
          </p>
        )}
        {progress > 0 && progress < 100 && (
          <p className="text-xs text-rose mt-1 font-semibold">
            {Math.round(progress)}% read
          </p>
        )}
      </div>
    </Link>
  );
}
