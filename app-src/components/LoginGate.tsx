import { useState } from 'react';
import { verifyToken, setToken } from '../api';

interface LoginGateProps {
  onAuthenticated: () => void;
}

export default function LoginGate({ onAuthenticated }: LoginGateProps) {
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    setChecking(true);
    setError('');

    const valid = await verifyToken(input.trim());
    if (valid) {
      setToken(input.trim());
      onAuthenticated();
    } else {
      setError('Wrong token');
    }
    setChecking(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-100 dark:bg-bark-800 px-4 paw-bg">
      <div className="relative w-full max-w-sm animate-fade-in">
        {/* Neko sitting ON the card — overlaps the top edge */}
        <div className="flex justify-center">
          <img
            src="/neko-main.png"
            alt="Neko"
            className="w-36 h-36 object-contain relative z-10 mb-[-2.5rem] drop-shadow-lg neko-bounce"
          />
        </div>

        <div className="cozy-card pt-14 pb-8 px-8 text-center">
          <h1 className="text-xl font-bold text-bark-700 dark:text-cream-200 mb-1">
            Catalouge
          </h1>
          <p className="text-sm text-bark-400 dark:text-cream-400 mb-6">
            Mai's personal library
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter your bookshelf token"
              className="cozy-input text-center"
              autoFocus
            />
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <button
              type="submit"
              className="btn-primary"
              disabled={checking || !input.trim()}
            >
              {checking ? 'Checking...' : 'Enter Library'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
