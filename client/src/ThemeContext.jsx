import { createContext, useContext, useState, useLayoutEffect } from 'react';
import { THEMES, getRandomTheme } from './themes';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // On mount: use saved preference or pick random
    const savedId = localStorage.getItem('chess-theme-id');
    return savedId
      ? (THEMES.find(t => t.id === savedId) ?? getRandomTheme())
      : getRandomTheme();
  });

  const [isUserSet, setIsUserSet] = useState(
    () => !!localStorage.getItem('chess-theme-id')
  );

  // Apply CSS variables to :root whenever theme changes
  useLayoutEffect(() => {
    const root = document.documentElement;
    Object.entries({
      '--theme-bg':          theme.ui.bg,
      '--theme-primary':     theme.ui.primary,
      '--theme-card':        theme.ui.card,
      '--theme-text':        theme.ui.text,
      '--theme-text-muted':  theme.ui.textMuted,
      '--theme-border':      theme.ui.border,
      '--theme-sq-light':    theme.board.light,
      '--theme-sq-dark':     theme.board.dark,
    }).forEach(([k, v]) => root.style.setProperty(k, v));
    root.dataset.mode = theme.mode;
  }, [theme]);

  const pickTheme = (id) => {
    const t = THEMES.find(t => t.id === id);
    if (!t) return;
    localStorage.setItem('chess-theme-id', id);
    setIsUserSet(true);
    setTheme(t);
  };

  const clearPreference = () => {
    localStorage.removeItem('chess-theme-id');
    setIsUserSet(false);
    setTheme(getRandomTheme());
  };

  return (
    <ThemeContext.Provider value={{ theme, pickTheme, clearPreference, isUserSet, THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};
