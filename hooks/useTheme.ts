import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark';

// This custom hook manages the application's theme.
export const useTheme = (): [Theme, () => void] => {
  // Initialize theme state from localStorage or system preference.
  // This runs only once on component mount.
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') {
      return 'light'; // Default for server-side rendering
    }
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark' || storedTheme === 'light') {
      return storedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // A memoized function to toggle the theme.
  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  }, []);

  // Effect to update the DOM and localStorage when the theme changes.
  useEffect(() => {
    const root = window.document.documentElement;
    // Remove the old theme class and add the new one.
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    // Persist the new theme to localStorage.
    try {
      localStorage.setItem('theme', theme);
    } catch (error) {
      console.error('Failed to save theme to localStorage', error);
    }
  }, [theme]);

  return [theme, toggleTheme];
};
