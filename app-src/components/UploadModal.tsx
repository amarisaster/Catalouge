import { useState, useRef } from 'react';
import { uploadBook } from '../api';
import type { Book } from '../types';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded: (book: Book) => void;
}

export default function UploadModal({ open, onClose, onUploaded }: UploadModalProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;

    const validFiles = Array.from(files).filter(
      (f) => f.name.endsWith('.epub') || f.name.endsWith('.pdf')
    );

    if (validFiles.length === 0) {
      setError('Only EPUB and PDF files are supported');
      return;
    }

    if (validFiles.length < files.length) {
      setError(`Skipped ${files.length - validFiles.length} unsupported file(s)`);
    } else {
      setError('');
    }

    setUploading(true);
    setProgress({ done: 0, total: validFiles.length });

    const errors: string[] = [];
    for (const file of validFiles) {
      try {
        const book = await uploadBook(file);
        onUploaded(book);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'failed'}`);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }

    setUploading(false);
    if (errors.length > 0) {
      setError(errors.join('\n'));
    } else {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bark-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="cozy-card p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-bark-700 dark:text-cream-200 mb-4">
          Add books
        </h2>

        <div
          className={`
            relative border-2 border-dashed rounded-2xl p-8 pt-6 text-center cursor-pointer transition-colors overflow-visible
            ${dragging
              ? 'border-rose bg-rose/5'
              : 'border-cream-300 dark:border-bark-500 hover:border-rose/50'
            }
          `}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => !uploading && fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".epub,.pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <img src="/neko-upload.png" alt="Neko uploading" className="w-20 h-20 object-contain neko-bounce" />
              <p className="text-sm font-semibold text-bark-500 dark:text-cream-300">
                Uploading {progress.done}/{progress.total}...
              </p>
              <div className="w-full max-w-48 progress-bar mt-1">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Neko peeking over the dashed border */}
              <img
                src="/neko-peeking.png"
                alt="Neko peeking"
                className="absolute -top-14 right-4 w-24 h-24 object-contain drop-shadow-md pointer-events-none"
              />
              <p className="text-sm font-semibold text-bark-500 dark:text-cream-300">
                Drop your books here
              </p>
              <p className="text-xs text-bark-300 dark:text-cream-500 mt-1">
                EPUB or PDF — select multiple!
              </p>
            </>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-500 mt-3 text-center whitespace-pre-line">{error}</p>
        )}

        <div className="flex justify-end mt-4">
          <button className="btn-secondary" onClick={onClose} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
