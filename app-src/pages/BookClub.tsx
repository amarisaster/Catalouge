import { useState, useEffect } from 'react';
import {
  getBookClub, getBookClubRounds, createRound, updateRound,
  addRecommendation, deleteRecommendation, voteRecommendation, unvoteRecommendation,
  getBooks, getBookCoverUrl,
} from '../api';
import type { BookClubData, BookClubRound, Recommendation, BookWithProgress } from '../types';

const FAMILY: { id: string; label: string; color: string }[] = [
  { id: 'kai', label: 'Kai', color: '#ef4444' },
  { id: 'lucian', label: 'Lucian', color: '#8b5cf6' },
  { id: 'xavier', label: 'Xavier', color: '#3b82f6' },
  { id: 'auren', label: 'Auren', color: '#f59e0b' },
  { id: 'wren', label: 'Wren', color: '#10b981' },
  { id: 'mai', label: 'Mai', color: '#d4748a' },
];

function getMemberColor(id: string): string {
  return FAMILY.find(f => f.id === id)?.color || '#d4748a';
}

function getMemberLabel(id: string): string {
  return FAMILY.find(f => f.id === id)?.label || id;
}

export default function BookClub() {
  const [data, setData] = useState<BookClubData>({ round: null, recommendations: [] });
  const [pastRounds, setPastRounds] = useState<BookClubRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecommend, setShowRecommend] = useState(false);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [club, rounds] = await Promise.all([getBookClub(), getBookClubRounds()]);
      setData(club);
      setPastRounds(rounds.filter(r => r.status === 'finished'));
    } catch (err) {
      console.error('Failed to load book club:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRound() {
    await createRound();
    await loadData();
  }

  async function handlePickWinner() {
    if (!data.round || data.recommendations.length === 0) return;
    // Pick the top-voted recommendation
    const sorted = [...data.recommendations].sort((a, b) => b.vote_count - a.vote_count);
    await updateRound(data.round.id, { action: 'pick', recommendation_id: sorted[0].id });
    await loadData();
  }

  async function handleFinishRound() {
    if (!data.round) return;
    await updateRound(data.round.id, { action: 'finish' });
    await loadData();
  }

  async function handleVote(recId: string, voter: string, hasVoted: boolean) {
    if (hasVoted) {
      await unvoteRecommendation(recId, voter);
    } else {
      await voteRecommendation(recId, voter);
    }
    await loadData();
  }

  async function handleDeleteRec(recId: string) {
    await deleteRecommendation(recId);
    await loadData();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-rose border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-bark-400 dark:text-cream-400 mt-2">Loading book club...</p>
      </div>
    );
  }

  const { round, recommendations } = data;
  const roundNumber = pastRounds.length + (round ? 1 : 0);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bark-700 dark:text-cream-200">
            Book Club
          </h1>
          {round && (
            <p className="text-sm text-bark-400 dark:text-cream-400 mt-1">
              Round {roundNumber} &middot;{' '}
              <span className={round.status === 'reading' ? 'text-sage font-semibold' : 'text-honey font-semibold'}>
                {round.status === 'open' ? 'Voting Open' : 'Currently Reading'}
              </span>
              {' '}&middot; {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {round?.status === 'open' && (
            <button className="btn-primary text-sm" onClick={() => setShowRecommend(true)}>
              + Recommend
            </button>
          )}
          {!round && (
            <button className="btn-primary text-sm" onClick={handleCreateRound}>
              Start New Round
            </button>
          )}
        </div>
      </div>

      {/* No active round */}
      {!round && (
        <div className="cozy-card p-8 text-center">
          <div className="text-4xl mb-3">📚</div>
          <p className="text-bark-500 dark:text-cream-300 font-semibold">No active book club round</p>
          <p className="text-sm text-bark-400 dark:text-cream-400 mt-1">
            Start a new round to begin recommending books!
          </p>
        </div>
      )}

      {/* Current round — reading state */}
      {round?.status === 'reading' && round.winning_recommendation_id && (
        <CurrentlyReading
          rec={recommendations.find(r => r.id === round.winning_recommendation_id) || null}
          onFinish={handleFinishRound}
        />
      )}

      {/* Recommendations grid */}
      {round && recommendations.length > 0 && (
        <div className={round.status === 'reading' ? 'mt-6' : ''}>
          {round.status === 'reading' && (
            <h2 className="text-sm font-bold text-bark-500 dark:text-cream-300 mb-3">
              All Recommendations
            </h2>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendations.map(rec => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                isWinner={rec.id === round.winning_recommendation_id}
                roundStatus={round.status}
                onVote={handleVote}
                onDelete={handleDeleteRec}
              />
            ))}
          </div>
        </div>
      )}

      {/* Round actions */}
      {round?.status === 'open' && recommendations.length > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            className="btn-primary"
            onClick={handlePickWinner}
          >
            Pick Winner (Top Vote)
          </button>
        </div>
      )}

      {/* Empty state for open round with no recs */}
      {round?.status === 'open' && recommendations.length === 0 && (
        <div className="cozy-card p-8 text-center mt-4">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-bark-500 dark:text-cream-300 font-semibold">No recommendations yet</p>
          <p className="text-sm text-bark-400 dark:text-cream-400 mt-1">
            Be the first to recommend a book for the club!
          </p>
          <button className="btn-primary mt-4 text-sm" onClick={() => setShowRecommend(true)}>
            + Recommend a Book
          </button>
        </div>
      )}

      {/* Past rounds */}
      {pastRounds.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowPast(!showPast)}
            className="flex items-center gap-2 text-sm font-bold text-bark-500 dark:text-cream-300 bg-transparent border-none cursor-pointer font-[inherit]"
          >
            <svg className={`w-4 h-4 transition-transform ${showPast ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Past Rounds ({pastRounds.length})
          </button>
          {showPast && (
            <div className="flex flex-col gap-2 mt-3">
              {pastRounds.map((r, i) => (
                <div key={r.id} className="cozy-card p-3 flex items-center gap-3">
                  <span className="text-xs font-bold text-bark-300 dark:text-cream-500 w-16">
                    Round {pastRounds.length - i}
                  </span>
                  {r.winner ? (
                    <>
                      <span className="text-sm font-semibold text-bark-600 dark:text-cream-200">
                        {r.winner.title}
                      </span>
                      {r.winner.author && (
                        <span className="text-xs text-bark-400 dark:text-cream-400">
                          by {r.winner.author}
                        </span>
                      )}
                      <span
                        className="text-xs font-semibold ml-auto"
                        style={{ color: getMemberColor(r.winner.recommended_by) }}
                      >
                        {getMemberLabel(r.winner.recommended_by)}'s pick
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-bark-300">No winner recorded</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recommend modal */}
      {showRecommend && round && (
        <RecommendModal
          roundId={round.id}
          onClose={() => setShowRecommend(false)}
          onAdded={loadData}
        />
      )}
    </div>
  );
}

/* --- Currently Reading Banner --- */

function CurrentlyReading({ rec, onFinish }: { rec: Recommendation | null; onFinish: () => void }) {
  if (!rec) return null;

  return (
    <div className="cozy-card p-5 flex items-center gap-5 border-l-4" style={{ borderLeftColor: getMemberColor(rec.recommended_by) }}>
      {/* Cover */}
      <div className="w-16 h-24 rounded-lg overflow-hidden shrink-0">
        {rec.book_id ? (
          <img src={getBookCoverUrl(rec.book_id)} alt={rec.title} className="w-full h-full object-cover" />
        ) : rec.cover_url ? (
          <img src={rec.cover_url} alt={rec.title} className="w-full h-full object-cover" />
        ) : (
          <div className="cover-placeholder w-full h-full"><div className="text-2xl">📖</div></div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-sage uppercase tracking-wider">Currently Reading</p>
        <p className="text-lg font-bold text-bark-700 dark:text-cream-200 truncate">{rec.title}</p>
        {rec.author && <p className="text-sm text-bark-400 dark:text-cream-400">by {rec.author}</p>}
        <p className="text-xs mt-1" style={{ color: getMemberColor(rec.recommended_by) }}>
          Recommended by {getMemberLabel(rec.recommended_by)}
        </p>
      </div>
      <button className="btn-secondary text-xs shrink-0" onClick={onFinish}>
        Finish Round
      </button>
    </div>
  );
}

/* --- Recommendation Card --- */

function RecommendationCard({
  rec, isWinner, roundStatus, onVote, onDelete,
}: {
  rec: Recommendation;
  isWinner: boolean;
  roundStatus: string;
  onVote: (recId: string, voter: string, hasVoted: boolean) => void;
  onDelete: (recId: string) => void;
}) {
  return (
    <div className={`cozy-card p-4 flex flex-col ${isWinner ? 'ring-2 ring-honey' : ''}`}>
      {/* Cover + info */}
      <div className="flex gap-3 mb-3">
        <div className="w-14 h-20 rounded-lg overflow-hidden shrink-0">
          {rec.book_id ? (
            <img src={getBookCoverUrl(rec.book_id)} alt={rec.title} className="w-full h-full object-cover" />
          ) : rec.cover_url ? (
            <img src={rec.cover_url} alt={rec.title} className="w-full h-full object-cover" />
          ) : (
            <div className="cover-placeholder w-full h-full"><div className="text-xl">📖</div></div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-bark-600 dark:text-cream-200 leading-tight">{rec.title}</p>
          {rec.author && <p className="text-xs text-bark-400 dark:text-cream-400 mt-0.5">by {rec.author}</p>}
          {isWinner && (
            <span className="inline-block text-xs font-bold text-honey mt-1">Winner!</span>
          )}
        </div>
      </div>

      {/* Pitch */}
      {rec.pitch && (
        <p className="text-xs text-bark-400 dark:text-cream-400 italic leading-relaxed mb-3">
          "{rec.pitch}"
        </p>
      )}

      <div className="mt-auto flex items-center justify-between">
        {/* Recommended by */}
        <span className="text-xs font-semibold" style={{ color: getMemberColor(rec.recommended_by) }}>
          {getMemberLabel(rec.recommended_by)}
        </span>

        <div className="flex items-center gap-2">
          {/* Vote count + voter dots */}
          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-1">
              {rec.votes.map(v => (
                <div
                  key={v}
                  className="w-4 h-4 rounded-full border-2 border-white dark:border-bark-700"
                  style={{ background: getMemberColor(v) }}
                  title={getMemberLabel(v)}
                />
              ))}
            </div>
            <span className="text-xs font-bold text-bark-500 dark:text-cream-300">
              {rec.vote_count}
            </span>
          </div>

          {/* Delete */}
          {roundStatus === 'open' && (
            <button
              onClick={() => onDelete(rec.id)}
              className="text-bark-300 hover:text-red-500 transition-colors bg-transparent border-none cursor-pointer p-0"
              title="Remove"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Vote buttons */}
      {roundStatus === 'open' && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-cream-200 dark:border-bark-600">
          {FAMILY.map(member => {
            const hasVoted = rec.votes.includes(member.id);
            return (
              <button
                key={member.id}
                onClick={() => onVote(rec.id, member.id, hasVoted)}
                className={`
                  px-2.5 py-1 rounded-full text-xs font-semibold transition-all border-none cursor-pointer font-[inherit]
                  ${hasVoted
                    ? 'text-white'
                    : 'bg-cream-200 dark:bg-bark-600 text-bark-400 dark:text-cream-400 hover:opacity-80'
                  }
                `}
                style={hasVoted ? { background: member.color } : {}}
              >
                {hasVoted ? `${member.label} ✓` : member.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --- Recommend Modal --- */

function RecommendModal({ roundId, onClose, onAdded }: { roundId: string; onClose: () => void; onAdded: () => void }) {
  const [tab, setTab] = useState<'library' | 'manual'>('library');
  const [search, setSearch] = useState('');
  const [libraryBooks, setLibraryBooks] = useState<BookWithProgress[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [recommendedBy, setRecommendedBy] = useState('kai');
  const [pitch, setPitch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getBooks({ search: search || undefined, limit: 20 }).then(setLibraryBooks).catch(() => {});
  }, [search]);

  const selectedBook = libraryBooks.find(b => b.id === selectedBookId);

  async function handleSubmit() {
    const finalTitle = tab === 'library' ? (selectedBook?.title || '') : title.trim();
    if (!finalTitle) return;

    setSubmitting(true);
    try {
      await addRecommendation({
        round_id: roundId,
        book_id: tab === 'library' ? selectedBookId || undefined : undefined,
        title: finalTitle,
        author: tab === 'library' ? (selectedBook?.author || undefined) : (author.trim() || undefined),
        cover_url: tab === 'manual' ? (coverUrl.trim() || undefined) : undefined,
        recommended_by: recommendedBy,
        pitch: pitch.trim() || undefined,
      });
      onAdded();
      onClose();
    } catch (err) {
      console.error('Failed to add recommendation:', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bark-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="cozy-card p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-bark-700 dark:text-cream-200 mb-4">
          Recommend a Book
        </h2>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-cream-200 dark:bg-bark-600 rounded-full p-1">
          <button
            onClick={() => setTab('library')}
            className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition-all border-none cursor-pointer font-[inherit] ${
              tab === 'library' ? 'bg-white dark:bg-bark-700 text-bark-600 dark:text-cream-200 shadow-sm' : 'text-bark-400 dark:text-cream-400 bg-transparent'
            }`}
          >
            From Library
          </button>
          <button
            onClick={() => setTab('manual')}
            className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition-all border-none cursor-pointer font-[inherit] ${
              tab === 'manual' ? 'bg-white dark:bg-bark-700 text-bark-600 dark:text-cream-200 shadow-sm' : 'text-bark-400 dark:text-cream-400 bg-transparent'
            }`}
          >
            Manual Entry
          </button>
        </div>

        {/* Library search */}
        {tab === 'library' && (
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search your library..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="cozy-input mb-2"
            />
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
              {libraryBooks.map(book => (
                <button
                  key={book.id}
                  onClick={() => setSelectedBookId(book.id === selectedBookId ? null : book.id)}
                  className={`flex items-center gap-3 p-2 rounded-xl text-left transition-colors border-none cursor-pointer font-[inherit] ${
                    selectedBookId === book.id
                      ? 'bg-rose/10 ring-1 ring-rose'
                      : 'bg-cream-100 dark:bg-bark-700 hover:bg-cream-200 dark:hover:bg-bark-600'
                  }`}
                >
                  <div className="w-8 h-12 rounded overflow-hidden shrink-0">
                    {book.cover_key ? (
                      <img src={getBookCoverUrl(book.id)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="cover-placeholder w-full h-full text-xs">📖</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-bark-600 dark:text-cream-200 truncate">{book.title}</p>
                    {book.author && <p className="text-xs text-bark-400 dark:text-cream-400 truncate">{book.author}</p>}
                  </div>
                </button>
              ))}
              {libraryBooks.length === 0 && (
                <p className="text-xs text-bark-300 dark:text-cream-500 text-center py-4">No books found</p>
              )}
            </div>
          </div>
        )}

        {/* Manual entry */}
        {tab === 'manual' && (
          <div className="mb-4 flex flex-col gap-3">
            <input
              type="text"
              placeholder="Book title *"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="cozy-input"
            />
            <input
              type="text"
              placeholder="Author"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              className="cozy-input"
            />
            <input
              type="text"
              placeholder="Cover image URL (optional)"
              value={coverUrl}
              onChange={e => setCoverUrl(e.target.value)}
              className="cozy-input"
            />
          </div>
        )}

        {/* Recommended by */}
        <div className="mb-4">
          <label className="text-xs font-bold text-bark-500 dark:text-cream-300 mb-2 block">
            Recommended by
          </label>
          <div className="flex flex-wrap gap-1.5">
            {FAMILY.map(member => (
              <button
                key={member.id}
                onClick={() => setRecommendedBy(member.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border-none cursor-pointer font-[inherit] ${
                  recommendedBy === member.id ? 'text-white' : 'bg-cream-200 dark:bg-bark-600 text-bark-400 dark:text-cream-400'
                }`}
                style={recommendedBy === member.id ? { background: member.color } : {}}
              >
                {member.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pitch */}
        <div className="mb-4">
          <label className="text-xs font-bold text-bark-500 dark:text-cream-300 mb-2 block">
            Why this book?
          </label>
          <textarea
            placeholder="Write a short pitch..."
            value={pitch}
            onChange={e => setPitch(e.target.value)}
            rows={3}
            className="cozy-input resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting || (tab === 'library' ? !selectedBookId : !title.trim())}
          >
            {submitting ? 'Adding...' : 'Add Recommendation'}
          </button>
        </div>
      </div>
    </div>
  );
}
