import { Outlet, Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  dark: boolean;
  onToggleTheme: () => void;
}

export default function Layout({ dark, onToggleTheme }: LayoutProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col paw-bg">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-cream-100/80 dark:bg-bark-800/80 border-b border-cream-300/50 dark:border-bark-600/50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1 no-underline relative group">
            <div className="relative w-10 h-10 overflow-visible">
              <img
                src="/neko-hugging.png"
                alt="Neko"
                className="w-10 h-10 object-contain transition-transform group-hover:scale-110 group-hover:-translate-y-0.5"
              />
            </div>
            <span className="text-lg font-bold text-bark-600 dark:text-cream-200">
              Catalouge
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className={`text-sm font-semibold no-underline transition-colors ${
                location.pathname === '/' ? 'text-rose' : 'text-bark-400 dark:text-cream-400 hover:text-rose'
              }`}
            >
              Library
            </Link>
            <Link
              to="/book-club"
              className={`text-sm font-semibold no-underline transition-colors ${
                location.pathname === '/book-club' ? 'text-rose' : 'text-bark-400 dark:text-cream-400 hover:text-rose'
              }`}
            >
              Book Club
            </Link>

            <button
              onClick={onToggleTheme}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-cream-200 dark:bg-bark-600 hover:bg-cream-300 dark:hover:bg-bark-500 transition-colors border-none cursor-pointer"
              title={dark ? 'Light mode' : 'Dark mode'}
            >
              {dark ? (
                <svg className="w-4 h-4 text-honey" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-bark-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-bark-300 dark:text-bark-500">
        Made with love for cozy reading
      </footer>
    </div>
  );
}

