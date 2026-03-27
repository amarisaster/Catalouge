import type { Book, BookWithProgress, Shelf, ReadingProgress, Bookmark, Review, Annotation, Stats, BookClubData, BookClubRound } from './types';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const API_BASE = import.meta.env.PROD
  ? 'https://catalouge-api.amarisaster.workers.dev'
  : '';

// Token management
const TOKEN_KEY = 'catalouge-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || res.statusText);
  }
  return res.json();
}

// Auth check
export async function verifyToken(token: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

// Books
export async function getBooks(params?: {
  shelf?: string;
  search?: string;
  tag?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}): Promise<BookWithProgress[]> {
  const q = new URLSearchParams();
  if (params?.shelf) q.set('shelf', params.shelf);
  if (params?.search) q.set('search', params.search);
  if (params?.tag) q.set('tag', params.tag);
  if (params?.sort) q.set('sort', params.sort);
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.offset) q.set('offset', String(params.offset));
  const qs = q.toString();
  return request<BookWithProgress[]>(`/books${qs ? `?${qs}` : ''}`);
}

export async function getBook(id: string): Promise<Book> {
  return request<Book>(`/books/${id}`);
}

async function generatePdfCover(file: File): Promise<Blob | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport } as any).promise;
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
    });
  } catch (err) {
    console.error('[catalouge] PDF cover generation failed:', err);
    return null;
  }
}

export async function uploadBook(file: File): Promise<Book> {
  const formData = new FormData();
  formData.append('file', file);

  // Generate cover from first page for PDFs
  if (file.name.endsWith('.pdf')) {
    console.log('[catalouge] Generating PDF cover...');
    const cover = await generatePdfCover(file);
    console.log('[catalouge] Cover result:', cover ? `${cover.size} bytes` : 'FAILED');
    if (cover) formData.append('cover', cover, 'cover.jpg');
  }

  const res = await fetch(`${API_BASE}/api/books`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || res.statusText);
  }
  return res.json();
}

export async function updateBook(id: string, data: Partial<Book>): Promise<Book> {
  return request<Book>(`/books/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteBook(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/books/${id}`, { method: 'DELETE' });
}

// Shelves
export async function getShelves(): Promise<Shelf[]> {
  return request<Shelf[]>('/shelves');
}

export async function addBookToShelf(bookId: string, shelfId: string): Promise<void> {
  await request<{ ok: boolean }>(`/books/${bookId}/shelves`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shelf_id: shelfId }),
  });
}

export async function removeBookFromShelf(bookId: string, shelfId: string): Promise<void> {
  await request<{ ok: boolean }>(`/books/${bookId}/shelves/${shelfId}`, {
    method: 'DELETE',
  });
}

// Reading progress
export async function getProgress(bookId: string): Promise<ReadingProgress> {
  return request<ReadingProgress>(`/books/${bookId}/progress`);
}

export async function updateProgress(bookId: string, data: Partial<ReadingProgress>): Promise<void> {
  await request<{ ok: boolean }>(`/books/${bookId}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// Bookmarks
export async function getBookmarks(bookId: string): Promise<Bookmark[]> {
  return request<Bookmark[]>(`/books/${bookId}/bookmarks`);
}

export async function addBookmark(bookId: string, data: { cfi: string; label?: string; color?: string }): Promise<Bookmark> {
  return request<Bookmark>(`/books/${bookId}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteBookmark(bookId: string, bookmarkId: string): Promise<void> {
  await request<{ ok: boolean }>(`/books/${bookId}/bookmarks/${bookmarkId}`, {
    method: 'DELETE',
  });
}

// Reviews
export async function getReview(bookId: string): Promise<Review | null> {
  try {
    const reviews = await request<Review[]>(`/books/${bookId}/reviews`);
    return reviews[0] || null;
  } catch {
    return null;
  }
}

export async function saveReview(bookId: string, data: { rating?: number; review_text?: string }): Promise<Review> {
  return request<Review>(`/books/${bookId}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// Annotations
export async function getAnnotations(bookId: string): Promise<Annotation[]> {
  return request<Annotation[]>(`/books/${bookId}/annotations`);
}

export async function createAnnotation(bookId: string, data: { cfi_range: string; selected_text?: string; comment?: string; color?: string }): Promise<Annotation> {
  return request<Annotation>(`/books/${bookId}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateAnnotation(annotationId: string, data: { comment?: string; color?: string }): Promise<void> {
  await request<{ ok: boolean }>(`/annotations/${annotationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
  await request<{ ok: boolean }>(`/annotations/${annotationId}`, { method: 'DELETE' });
}

// Stats
export async function getStats(): Promise<Stats> {
  return request<Stats>('/stats');
}

// File URLs (include token as query param for direct browser access)
export function getBookFileUrl(bookId: string): string {
  const token = getToken();
  return `${API_BASE}/api/books/${bookId}/file${token ? `?token=${token}` : ''}`;
}

export function getBookCoverUrl(bookId: string): string {
  const token = getToken();
  return `${API_BASE}/api/books/${bookId}/cover${token ? `?token=${token}` : ''}`;
}

// Book Club
export async function getBookClub(): Promise<BookClubData> {
  return request<BookClubData>('/book-club');
}

export async function getBookClubRounds(): Promise<BookClubRound[]> {
  return request<BookClubRound[]>('/book-club/rounds');
}

export async function createRound(): Promise<{ id: string; status: string }> {
  return request('/book-club/rounds', { method: 'POST' });
}

export async function updateRound(id: string, data: { action: 'pick' | 'finish'; recommendation_id?: string }): Promise<void> {
  await request(`/book-club/rounds/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function addRecommendation(data: {
  round_id: string; book_id?: string; title: string; author?: string;
  cover_url?: string; recommended_by: string; pitch?: string;
}): Promise<void> {
  await request('/book-club/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteRecommendation(id: string): Promise<void> {
  await request(`/book-club/recommendations/${id}`, { method: 'DELETE' });
}

export async function voteRecommendation(id: string, voter: string): Promise<void> {
  await request(`/book-club/recommendations/${id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voter }),
  });
}

export async function unvoteRecommendation(id: string, voter: string): Promise<void> {
  await request(`/book-club/recommendations/${id}/vote/${voter}`, { method: 'DELETE' });
}
