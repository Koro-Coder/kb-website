import { useCallback, useEffect, useState } from 'react';

// The theme is already on <html> before React boots — index.html sets it from
// localStorage (or the OS preference) to avoid a flash of the wrong theme.
// This hook only reads that decision back and lets the toggle change it.

const STORAGE_KEY = 'pf-theme';

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// Private browsing can refuse storage. The theme still applies to this page,
// it just will not be remembered — not worth surfacing to the visitor.
function readChoice() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

function writeChoice(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    /* ignore */
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Follow the OS only while the visitor has never chosen for themselves —
  // once they have, their choice outranks the system flipping at sunset. The
  // check happens per event rather than once on mount, so a visitor who
  // toggles mid-session stops being overridden immediately.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = (event) => {
      if (!readChoice()) {
        setTheme(event.matches ? 'dark' : 'light');
      }
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  // Persisting here rather than in an effect on `theme`: an effect would also
  // fire for the initial value, recording a choice the visitor never made and
  // permanently detaching them from their OS setting.
  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    writeChoice(next);
    setTheme(next);
  }, [theme]);

  return { theme, toggle };
}
