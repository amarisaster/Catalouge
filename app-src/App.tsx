import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Library from './pages/Library';
import BookDetail from './pages/BookDetail';
import BookClub from './pages/BookClub';
import Reader from './pages/Reader';
import LoginGate from './components/LoginGate';
import { getToken } from './api';

function App() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('catalouge-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [authenticated, setAuthenticated] = useState(() => !!getToken());

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('catalouge-theme', dark ? 'dark' : 'light');
  }, [dark]);

  if (!authenticated) {
    return <LoginGate onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout dark={dark} onToggleTheme={() => setDark(!dark)} />}>
          <Route path="/" element={<Library />} />
          <Route path="/book/:id" element={<BookDetail />} />
          <Route path="/book-club" element={<BookClub />} />
        </Route>
        <Route path="/read/:id" element={<Reader />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
