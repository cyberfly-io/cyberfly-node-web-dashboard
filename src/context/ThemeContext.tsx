import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage first, then system preference
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored) return stored;
    
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    const body = document.body;
    
    // Update HTML element class
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    
    // Update body classes for background and text
    if (theme === 'dark') {
      body.classList.add('bg-gray-900', 'text-white');
      body.classList.remove('bg-white', 'text-gray-900');
    } else {
      body.classList.add('bg-white', 'text-gray-900');
      body.classList.remove('bg-gray-900', 'text-white');
    }
    
    localStorage.setItem('theme', theme);
    console.log('Theme changed to:', theme);
    console.log('HTML classes:', root.className);
    console.log('Body classes:', body.className);
  }, [theme]);

  const toggleTheme = () => {
    console.log('Toggle theme clicked, current:', theme);
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
