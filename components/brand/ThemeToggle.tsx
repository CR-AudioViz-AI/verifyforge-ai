'use client';

import React from 'react';
import { useTheme } from './ThemeProvider';

/**
 * Innocuous Theme Toggle
 * 
 * Small, unobtrusive toggle that doesn't interfere with header or quicklinks.
 * Positioned as a small icon button that's accessible but not distracting.
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const cycleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  return (
    <button
      onClick={cycleTheme}
      className="relative w-8 h-8 flex items-center justify-center rounded-full 
                 text-slate-500 dark:text-slate-400
                 hover:bg-slate-100 dark:hover:bg-slate-800
                 transition-colors duration-200
                 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2
                 dark:focus:ring-offset-slate-900"
      aria-label={`Current theme: ${theme}. Click to change.`}
      title={`Theme: ${theme}`}
    >
      {/* Sun icon - Light mode */}
      <svg
        className={`w-4 h-4 absolute transition-all duration-300 ${
          resolvedTheme === 'light' ? 'opacity-100 rotate-0' : 'opacity-0 rotate-90'
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
      
      {/* Moon icon - Dark mode */}
      <svg
        className={`w-4 h-4 absolute transition-all duration-300 ${
          resolvedTheme === 'dark' ? 'opacity-100 rotate-0' : 'opacity-0 -rotate-90'
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
      
      {/* System indicator dot */}
      {theme === 'system' && (
        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 
                         bg-cyan-500 rounded-full" />
      )}
    </button>
  );
}

export default ThemeToggle;
