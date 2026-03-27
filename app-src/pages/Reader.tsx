import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ePub from 'epubjs';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getBook, getBookFileUrl, updateProgress, getProgress, getAnnotations, createAnnotation, updateAnnotation, deleteAnnotation } from '../api';
import type { Book, Annotation } from '../types';

const HIGHLIGHT_COLORS = [
  { name: 'Rose', value: '#d4748a' },
  { name: 'Honey', value: '#e8a849' },
  { name: 'Sage', value: '#8fad8b' },
  { name: 'Lavender', value: '#b0a0d4' },
  { name: 'Sky', value: '#89b8d4' },
];

export default function Reader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [fileType, setFileType] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getBook(id).then(b => setFileType(b.file_type)).catch(() => setFileType('epub'));
  }, [id]);

  if (!fileType) {
    return (
      <div className="fixed inset-0 bg-cream-100 dark:bg-bark-800 flex items-center justify-center z-50">
        <div className="w-8 h-8 border-2 border-rose border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (fileType === 'pdf') {
    return <PdfReader id={id!} navigate={navigate} />;
  }

  return <EpubReader id={id!} navigate={navigate} />;
}

function PdfReader({ id, navigate }: { id: string; navigate: (path: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [book, setBook] = useState<Book | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [turning, setTurning] = useState<'left' | 'right' | null>(null);
  const touchRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    loadPdf();
    return () => { pdfRef.current = null; };
  }, [id]);

  async function loadPdf() {
    try {
      const [b, savedProgress] = await Promise.all([
        getBook(id),
        getProgress(id).catch(() => null),
      ]);
      setBook(b);

      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

      const res = await fetch(getBookFileUrl(id));
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const buf = await res.arrayBuffer();

      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      pdfRef.current = pdf;
      setTotalPages(pdf.numPages);

      const startPage = savedProgress?.current_page || 1;
      setCurrentPage(startPage);
      await renderPage(pdf, startPage);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load PDF:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load PDF');
      setLoading(false);
    }
  }

  async function renderPage(pdf: any, pageNum: number) {
    if (!canvasRef.current) return;
    const page = await pdf.getPage(pageNum);
    const canvas = canvasRef.current;
    const container = canvas.parentElement;
    if (!container) return;

    // Fit page to container
    const baseViewport = page.getViewport({ scale: 1 });
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const fitScale = Math.min(
      containerWidth / baseViewport.width,
      containerHeight / baseViewport.height
    ) * scale;

    const viewport = page.getViewport({ scale: fitScale * window.devicePixelRatio });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / window.devicePixelRatio}px`;
    canvas.style.height = `${viewport.height / window.devicePixelRatio}px`;

    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport } as any).promise;
  }

  useEffect(() => {
    if (!pdfRef.current || loading) return;
    renderPage(pdfRef.current, currentPage);
    const percent = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;
    updateProgress(id, {
      current_page: currentPage,
      total_pages: totalPages,
      progress_percent: percent,
    }).catch(() => {});
  }, [currentPage, scale]);

  function goToPage(page: number) {
    if (page < 1 || page > totalPages || turning) return;
    const dir = page > currentPage ? 'right' : 'left';
    setTurning(dir);
    setTimeout(() => setCurrentPage(page), 200);
    setTimeout(() => setTurning(null), 500);
  }

  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goToPage(currentPage + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goToPage(currentPage - 1);
  }, [currentPage, totalPages]);

  useEffect(() => {
    document.addEventListener('keyup', handleKeyboard);
    return () => document.removeEventListener('keyup', handleKeyboard);
  }, [handleKeyboard]);

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!touchRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchRef.current.x;
    const dy = touch.clientY - touchRef.current.y;
    const dt = Date.now() - touchRef.current.time;
    touchRef.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 500) {
      if (dx < 0) goToPage(currentPage + 1);
      else goToPage(currentPage - 1);
    }
  }

  const isDark = document.documentElement.classList.contains('dark');
  const percent = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-cream-100 dark:bg-bark-800 flex flex-col z-50">
      {/* Toolbar */}
      <div className="h-12 bg-cream-50/90 dark:bg-bark-900/90 backdrop-blur-md border-b border-cream-300/50 dark:border-bark-600/50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/book/${id}`)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-cream-200 dark:bg-bark-600 border-none cursor-pointer hover:bg-cream-300 dark:hover:bg-bark-500 transition-colors"
          >
            <svg className="w-4 h-4 text-bark-500 dark:text-cream-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-bark-500 dark:text-cream-300 truncate max-w-48">
            {book?.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="w-8 h-8 flex items-center justify-center rounded-full bg-cream-200 dark:bg-bark-600 border-none cursor-pointer text-xs font-bold text-bark-500 dark:text-cream-300 hover:bg-cream-300 transition-colors" title="Zoom out">-</button>
          <span className="text-xs text-bark-400 dark:text-cream-400 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="w-8 h-8 flex items-center justify-center rounded-full bg-cream-200 dark:bg-bark-600 border-none cursor-pointer text-xs font-bold text-bark-500 dark:text-cream-300 hover:bg-cream-300 transition-colors" title="Zoom in">+</button>
        </div>
      </div>

      {/* PDF canvas */}
      <div className="flex-1 relative min-h-0 overflow-auto" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-cream-100 dark:bg-bark-800 z-30">
            {loadError ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-semibold text-rose">{loadError}</p>
                <button onClick={() => navigate(`/book/${id}`)} className="btn-secondary text-sm mt-2">Go back</button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-rose border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-bark-400 dark:text-cream-400">Loading PDF...</p>
              </div>
            )}
          </div>
        )}
        <div className={`flex items-center justify-center min-h-full p-4 ${isDark ? 'bg-[#1a1412]' : 'bg-[#faf6f1]'}`}>
          <canvas ref={canvasRef} className="shadow-lg rounded-sm" />
        </div>

        {/* Page slide overlay */}
        {turning === 'right' && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div className={`absolute inset-0 page-flip-next ${isDark ? 'bg-[#1a1412]' : 'bg-[#faf6f1]'}`} />
          </div>
        )}
        {turning === 'left' && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div className={`absolute inset-0 page-flip-prev ${isDark ? 'bg-[#1a1412]' : 'bg-[#faf6f1]'}`} />
          </div>
        )}

        {/* Page turn areas */}
        <button onClick={() => goToPage(currentPage - 1)} className="absolute left-0 top-0 bottom-0 w-16 bg-transparent border-none cursor-pointer opacity-0 hover:opacity-100 transition-opacity z-10" aria-label="Previous page">
          <div className="flex items-center justify-center h-full">
            <svg className="w-6 h-6 text-bark-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </div>
        </button>
        <button onClick={() => goToPage(currentPage + 1)} className="absolute right-0 top-0 bottom-0 w-16 bg-transparent border-none cursor-pointer opacity-0 hover:opacity-100 transition-opacity z-10" aria-label="Next page">
          <div className="flex items-center justify-center h-full">
            <svg className="w-6 h-6 text-bark-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </div>
        </button>
      </div>

      {/* Bottom bar */}
      <div className="h-8 bg-cream-50/90 dark:bg-bark-900/90 backdrop-blur-md border-t border-cream-300/50 dark:border-bark-600/50 flex items-center px-4 gap-3 shrink-0">
        <span className="text-xs text-bark-400 dark:text-cream-400 flex-1">Page {currentPage} of {totalPages}</span>
        <span className="text-xs font-semibold text-rose whitespace-nowrap">{Math.round(percent)}%</span>
        <div className="w-32 progress-bar"><div className="progress-bar-fill" style={{ width: `${percent}%` }} /></div>
      </div>
    </div>
  );
}

function EpubReader({ id, navigate }: { id: string; navigate: (path: string) => void }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const bookRef = useRef<any>(null);

  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [currentChapter, setCurrentChapter] = useState('');
  const [progress, setProgressState] = useState(0);
  const [showToc, setShowToc] = useState(false);
  const [toc, setToc] = useState<{ label: string; href: string }[]>([]);
  const [fontSize, setFontSize] = useState(() => {
    return parseInt(localStorage.getItem('catalouge-font-size') || '100');
  });
  const [dualPage, setDualPage] = useState(() => {
    const saved = localStorage.getItem('catalouge-spread');
    if (saved !== null) return saved === 'true';
    return window.innerWidth >= 768;
  });

  // Read Aloud state
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Annotations state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [selectedCfiRange, setSelectedCfiRange] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [annotationPopup, setAnnotationPopup] = useState<{ x: number; y: number } | null>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [annotationComment, setAnnotationComment] = useState('');
  const [annotationColor, setAnnotationColor] = useState('#d4748a');

  const [turning, setTurning] = useState<'left' | 'right' | null>(null);

  const isDark = document.documentElement.classList.contains('dark');

  useEffect(() => {
    if (!id) return;
    loadBook();
    return () => {
      try { bookRef.current?.destroy(); } catch {}
      try { speechSynthesis.cancel(); } catch {}
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [id]);

  async function loadBook() {
    try {
      const [b, savedProgress, annots] = await Promise.all([
        getBook(id!),
        getProgress(id!).catch(() => null),
        getAnnotations(id!).catch(() => []),
      ]);
      setBook(b);
      setAnnotations(annots);

      if (!viewerRef.current) throw new Error('Viewer not available');
      const rect = viewerRef.current.getBoundingClientRect();

      const res = await fetch(getBookFileUrl(id!));
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const buf = await res.arrayBuffer();

      const epubBook = ePub(buf as any);
      bookRef.current = epubBook;

      const rendition = epubBook.renderTo(viewerRef.current, {
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
        spread: dualPage ? 'auto' : 'none',
        flow: 'paginated' as const,
      });
      renditionRef.current = rendition;

      const dark = document.documentElement.classList.contains('dark');
      rendition.themes.fontSize(`${fontSize}%`);
      rendition.themes.default({
        body: {
          'font-family': "'Quicksand', Georgia, serif !important",
          'line-height': '1.8 !important',
          'color': dark ? '#e8dccb !important' : '#3d3022 !important',
          'background': dark ? '#1a1412 !important' : '#faf6f1 !important',
        },
        img: {
          'max-width': '100% !important',
          'max-height': '90vh !important',
          'height': 'auto !important',
          'object-fit': 'contain !important',
        },
        svg: {
          'max-width': '100% !important',
          'max-height': '90vh !important',
        },
      });

      rendition.on('displayed', () => setLoading(false));

      if (savedProgress?.current_cfi) {
        rendition.display(savedProgress.current_cfi).catch(() => rendition.display());
      } else {
        rendition.display();
      }

      setTimeout(() => setLoading(false), 10000);

      // TOC
      epubBook.loaded.navigation.then((nav: any) => {
        setToc(nav.toc.map((t: any) => ({ label: t.label.trim(), href: t.href })));
      });

      // Apply existing annotations as highlights
      rendition.on('displayed', () => {
        applyHighlights(rendition, annots);
      });

      // Text selection for new annotations
      rendition.on('selected', (cfiRange: string, _contents: any) => {
        const text = rendition.getRange(cfiRange)?.toString() || '';
        if (!text.trim()) return;

        setSelectedCfiRange(cfiRange);
        setSelectedText(text);
        setAnnotationComment('');
        setAnnotationColor('#d4748a');
        setEditingAnnotation(null);

        // Position popup near selection
        const iframe = viewerRef.current?.querySelector('iframe');
        if (iframe) {
          const iframeRect = iframe.getBoundingClientRect();
          const selection = iframe.contentWindow?.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const selRect = range.getBoundingClientRect();
            setAnnotationPopup({
              x: Math.min(iframeRect.left + selRect.left + selRect.width / 2, window.innerWidth - 180),
              y: iframeRect.top + selRect.top - 10,
            });
          }
        }
      });

      // Track location changes
      rendition.on('relocated', (location: any) => {
        const percent = epubBook.locations?.length()
          ? (location.start.percentage ?? 0) * 100
          : 0;
        setProgressState(percent);

        const navItem = epubBook.navigation?.toc?.find(
          (t: any) => t.href === location.start.href || location.start.href.includes(t.href)
        );
        if (navItem) setCurrentChapter(navItem.label.trim());

        updateProgress(id!, {
          current_cfi: location.start.cfi,
          progress_percent: percent,
          current_chapter: navItem?.label?.trim() || undefined,
        }).catch(() => {});
      });

      epubBook.ready.then(() => {
        epubBook.locations.generate(1024).catch(() => {});
      });

      rendition.on('keyup', handleKeyboard);
      document.addEventListener('keyup', handleKeyboard);
    } catch (err) {
      console.error('Failed to load book:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load book');
      setLoading(false);
    }
  }

  function applyHighlights(rendition: any, annots: Annotation[]) {
    for (const a of annots) {
      try {
        rendition.annotations.highlight(
          a.cfi_range,
          { id: a.id },
          () => {
            // Click on highlight — edit annotation
            setEditingAnnotation(a);
            setAnnotationComment(a.comment || '');
            setAnnotationColor(a.color);
            setSelectedText(a.selected_text || '');
            setSelectedCfiRange(a.cfi_range);
            setAnnotationPopup({ x: window.innerWidth / 2, y: 200 });
          },
          'hl',
          { fill: a.color, 'fill-opacity': '0.3', 'mix-blend-mode': 'multiply' }
        );
      } catch {}
    }
  }

  async function saveAnnotation() {
    if (!id) return;

    if (editingAnnotation) {
      await updateAnnotation(editingAnnotation.id, { comment: annotationComment, color: annotationColor });
      setAnnotations(prev => prev.map(a =>
        a.id === editingAnnotation.id ? { ...a, comment: annotationComment, color: annotationColor } : a
      ));
    } else {
      const newAnnot = await createAnnotation(id, {
        cfi_range: selectedCfiRange,
        selected_text: selectedText,
        comment: annotationComment,
        color: annotationColor,
      });
      setAnnotations(prev => [newAnnot, ...prev]);
    }

    // Re-apply highlights
    if (renditionRef.current) {
      renditionRef.current.annotations.remove(selectedCfiRange, 'highlight');
      applyHighlights(renditionRef.current, editingAnnotation
        ? annotations.map(a => a.id === editingAnnotation.id ? { ...a, comment: annotationComment, color: annotationColor } : a)
        : [{ id: 'new', book_id: id, cfi_range: selectedCfiRange, selected_text: selectedText, comment: annotationComment, color: annotationColor, created_at: '', updated_at: '' }, ...annotations]
      );
    }

    setAnnotationPopup(null);
    setEditingAnnotation(null);
  }

  async function removeAnnotation() {
    if (!editingAnnotation) return;
    await deleteAnnotation(editingAnnotation.id);
    setAnnotations(prev => prev.filter(a => a.id !== editingAnnotation.id));
    if (renditionRef.current) {
      renditionRef.current.annotations.remove(editingAnnotation.cfi_range, 'highlight');
    }
    setAnnotationPopup(null);
    setEditingAnnotation(null);
  }

  function turnPage(direction: 'next' | 'prev') {
    if (!renditionRef.current || turning) return;
    setTurning(direction === 'next' ? 'right' : 'left');
    // Swap content while slide overlay is covering it
    setTimeout(() => {
      if (direction === 'next') {
        renditionRef.current?.next();
      } else {
        renditionRef.current?.prev();
      }
    }, 200);
    // Clear after slide animation finishes (450ms + small buffer)
    setTimeout(() => setTurning(null), 500);
  }

  // Touch swipe for mobile
  const touchRef = useRef<{ x: number; y: number; time: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!touchRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchRef.current.x;
    const dy = touch.clientY - touchRef.current.y;
    const dt = Date.now() - touchRef.current.time;
    touchRef.current = null;

    // Horizontal swipe: at least 50px, more horizontal than vertical, within 500ms
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 500) {
      if (dx < 0) turnPage('next');
      else turnPage('prev');
    }
  }

  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      turnPage('next');
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      turnPage('prev');
    }
  }, []);

  useEffect(() => {
    return () => document.removeEventListener('keyup', handleKeyboard);
  }, [handleKeyboard]);

  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.spread(dualPage ? 'auto' : 'none');
      localStorage.setItem('catalouge-spread', String(dualPage));
    }
  }, [dualPage]);

  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}%`);
      localStorage.setItem('catalouge-font-size', String(fontSize));
    }
  }, [fontSize]);

  function toggleReadAloud() {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const iframe = viewerRef.current?.querySelector('iframe');
    if (!iframe?.contentDocument) return;
    const text = iframe.contentDocument.body.innerText;
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onend = () => {
      setSpeaking(false);
      renditionRef.current?.next();
    };
    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  function goToTocItem(href: string) {
    renditionRef.current?.display(href);
    setShowToc(false);
  }

  function goToAnnotation(a: Annotation) {
    renditionRef.current?.display(a.cfi_range);
    setShowAnnotations(false);
  }

  return (
    <div className="fixed inset-0 bg-cream-100 dark:bg-bark-800 flex flex-col z-50">
      {/* Toolbar */}
      <div className="h-12 bg-cream-50/90 dark:bg-bark-900/90 backdrop-blur-md border-b border-cream-300/50 dark:border-bark-600/50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/book/${id}`)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-cream-200 dark:bg-bark-600 border-none cursor-pointer hover:bg-cream-300 dark:hover:bg-bark-500 transition-colors"
          >
            <svg className="w-4 h-4 text-bark-500 dark:text-cream-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-bark-500 dark:text-cream-300 truncate max-w-48">
            {book?.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* TOC */}
          <button onClick={() => { setShowToc(!showToc); setShowAnnotations(false); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-cream-200 dark:bg-bark-600 border-none cursor-pointer hover:bg-cream-300 transition-colors" title="Table of Contents">
            <svg className="w-4 h-4 text-bark-500 dark:text-cream-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
          {/* Annotations list */}
          <button
            onClick={() => { setShowAnnotations(!showAnnotations); setShowToc(false); }}
            className={`w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer transition-colors ${showAnnotations ? 'bg-rose text-white' : 'bg-cream-200 dark:bg-bark-600 text-bark-500 dark:text-cream-300 hover:bg-cream-300'}`}
            title="Annotations"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </button>
          {/* Spread toggle */}
          <button
            onClick={() => setDualPage(d => !d)}
            className={`w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer transition-colors ${dualPage ? 'bg-rose text-white' : 'bg-cream-200 dark:bg-bark-600 text-bark-500 dark:text-cream-300 hover:bg-cream-300'}`}
            title={dualPage ? 'Single page' : 'Dual page'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </button>
          {/* Font size */}
          <button onClick={() => setFontSize((s) => Math.max(80, s - 10))} className="w-8 h-8 flex items-center justify-center rounded-full bg-cream-200 dark:bg-bark-600 border-none cursor-pointer text-xs font-bold text-bark-500 dark:text-cream-300 hover:bg-cream-300 transition-colors" title="Smaller text">A-</button>
          <button onClick={() => setFontSize((s) => Math.min(160, s + 10))} className="w-8 h-8 flex items-center justify-center rounded-full bg-cream-200 dark:bg-bark-600 border-none cursor-pointer text-xs font-bold text-bark-500 dark:text-cream-300 hover:bg-cream-300 transition-colors" title="Larger text">A+</button>
          {/* Read Aloud */}
          <button
            onClick={toggleReadAloud}
            className={`w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer transition-colors ${speaking ? 'bg-rose text-white' : 'bg-cream-200 dark:bg-bark-600 text-bark-500 dark:text-cream-300 hover:bg-cream-300'}`}
            title={speaking ? 'Stop reading' : 'Read aloud'}
          >
            {speaking ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8H4a1 1 0 00-1 1v6a1 1 0 001 1h2.5l4.5 4V4L6.5 8z" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* TOC sidebar */}
      {showToc && (
        <div className="absolute top-12 left-0 bottom-0 w-72 bg-cream-50 dark:bg-bark-900 border-r border-cream-300 dark:border-bark-600 z-40 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-bold text-bark-500 dark:text-cream-300 mb-3">Table of Contents</h3>
            <div className="flex flex-col gap-1">
              {toc.map((item, i) => (
                <button key={i} onClick={() => goToTocItem(item.href)} className="text-left text-sm px-3 py-2 rounded-lg text-bark-400 dark:text-cream-400 hover:bg-cream-200 dark:hover:bg-bark-700 bg-transparent border-none cursor-pointer font-[inherit] transition-colors">
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Annotations sidebar */}
      {showAnnotations && (
        <div className="absolute top-12 right-0 bottom-0 w-80 bg-cream-50 dark:bg-bark-900 border-l border-cream-300 dark:border-bark-600 z-40 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-sm font-bold text-bark-500 dark:text-cream-300 mb-3">
              Annotations ({annotations.length})
            </h3>
            {annotations.length === 0 ? (
              <p className="text-xs text-bark-300 dark:text-cream-500">
                Select text while reading to add annotations
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {annotations.map(a => (
                  <button
                    key={a.id}
                    onClick={() => goToAnnotation(a)}
                    className="text-left p-3 rounded-xl bg-cream-100 dark:bg-bark-700 border-none cursor-pointer font-[inherit] transition-colors hover:bg-cream-200 dark:hover:bg-bark-600"
                    style={{ borderLeft: `3px solid ${a.color}` }}
                  >
                    <p className="text-xs text-bark-400 dark:text-cream-400 line-clamp-2 italic">
                      "{a.selected_text}"
                    </p>
                    {a.comment && (
                      <p className="text-xs text-bark-500 dark:text-cream-300 mt-1.5">
                        {a.comment}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* EPUB viewer */}
      <div className="flex-1 relative min-h-0" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-cream-100 dark:bg-bark-800 z-30">
            <div className="flex flex-col items-center gap-3">
              {loadError ? (
                <>
                  <p className="text-sm font-semibold text-rose">{loadError}</p>
                  <button onClick={() => navigate(`/book/${id}`)} className="btn-secondary text-sm mt-2">Go back</button>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 border-2 border-rose border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-bark-400 dark:text-cream-400">Loading book...</p>
                </>
              )}
            </div>
          </div>
        )}
        <div
          ref={viewerRef}
          className={`absolute inset-0 ${isDark ? 'bg-[#1a1412]' : 'bg-[#faf6f1]'}`}
        />

        {/* Page slide overlay */}
        {turning === 'right' && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div className={`absolute inset-y-0 right-0 ${dualPage ? 'w-[52%]' : 'w-full'} page-flip-next ${isDark ? 'bg-[#1a1412]' : 'bg-[#faf6f1]'}`} />
          </div>
        )}
        {turning === 'left' && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div className={`absolute inset-y-0 left-0 ${dualPage ? 'w-[52%]' : 'w-full'} page-flip-prev ${isDark ? 'bg-[#1a1412]' : 'bg-[#faf6f1]'}`} />
          </div>
        )}


        {/* Page turn areas */}
        <button onClick={() => turnPage('prev')} className="absolute left-0 top-0 bottom-0 w-16 bg-transparent border-none cursor-pointer opacity-0 hover:opacity-100 transition-opacity z-10" aria-label="Previous page">
          <div className="flex items-center justify-center h-full">
            <svg className="w-6 h-6 text-bark-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </div>
        </button>
        <button onClick={() => turnPage('next')} className="absolute right-0 top-0 bottom-0 w-16 bg-transparent border-none cursor-pointer opacity-0 hover:opacity-100 transition-opacity z-10" aria-label="Next page">
          <div className="flex items-center justify-center h-full">
            <svg className="w-6 h-6 text-bark-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </div>
        </button>
      </div>

      {/* Annotation popup */}
      {annotationPopup && (
        <div
          className="fixed z-50"
          style={{ left: Math.max(16, annotationPopup.x - 160), top: Math.max(60, annotationPopup.y - 220) }}
        >
          <div className="w-80 cozy-card p-4 shadow-xl">
            {/* Selected text preview */}
            <p className="text-xs text-bark-400 dark:text-cream-400 italic line-clamp-2 mb-3">
              "{selectedText}"
            </p>

            {/* Color picker */}
            <div className="flex gap-2 mb-3">
              {HIGHLIGHT_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setAnnotationColor(c.value)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    annotationColor === c.value ? 'scale-110 border-bark-500 dark:border-cream-300' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ background: c.value }}
                  title={c.name}
                />
              ))}
            </div>

            {/* Comment input */}
            <textarea
              value={annotationComment}
              onChange={e => setAnnotationComment(e.target.value)}
              placeholder="Add a note... (optional)"
              className="cozy-input text-xs resize-none mb-3"
              rows={3}
            />

            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button onClick={saveAnnotation} className="btn-primary text-xs py-1.5 px-4">
                  {editingAnnotation ? 'Update' : 'Save'}
                </button>
                <button onClick={() => setAnnotationPopup(null)} className="btn-secondary text-xs py-1.5 px-4">
                  Cancel
                </button>
              </div>
              {editingAnnotation && (
                <button onClick={removeAnnotation} className="text-xs text-rose hover:text-rose-dark cursor-pointer bg-transparent border-none font-[inherit]">
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="h-8 bg-cream-50/90 dark:bg-bark-900/90 backdrop-blur-md border-t border-cream-300/50 dark:border-bark-600/50 flex items-center px-4 gap-3 shrink-0">
        <span className="text-xs text-bark-400 dark:text-cream-400 truncate flex-1">{currentChapter}</span>
        <span className="text-xs font-semibold text-rose whitespace-nowrap">{Math.round(progress)}%</span>
        <div className="w-32 progress-bar"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>
      </div>
    </div>
  );
}
