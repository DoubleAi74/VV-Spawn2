'use client';

import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';

const ThemeContext = createContext(null);

function normalizeHex(hex, fallback) {
  const value = String(hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return fallback;
}

export function ThemeProvider({ children, initialDashHex, initialBackHex, storageKey }) {
  const [dashHex, setDashHexState] = useState(initialDashHex || '#2d3e50');
  const [backHex, setBackHexState] = useState(initialBackHex || '#e5e7eb');
  const persistedKey = useMemo(
    () => (storageKey ? `volvox_theme_${storageKey}` : ''),
    [storageKey]
  );

  const setDashHex = useCallback((hex) => {
    setDashHexState(hex);
  }, []);

  const setBackHex = useCallback((hex) => {
    setBackHexState(hex);
  }, []);

  useEffect(() => {
    if (!persistedKey) return;
    try {
      const raw = window.localStorage.getItem(persistedKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const nextDash = normalizeHex(parsed?.dashHex, '');
      const nextBack = normalizeHex(parsed?.backHex, '');
      if (nextDash && nextDash !== dashHex) setDashHexState(nextDash);
      if (nextBack && nextBack !== backHex) setBackHexState(nextBack);
    } catch {
      // Ignore malformed local storage payloads.
    }
    // Intentionally run once per key so server props can be overridden by freshest client value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedKey]);

  useEffect(() => {
    if (!persistedKey) return;
    try {
      window.localStorage.setItem(
        persistedKey,
        JSON.stringify({ dashHex, backHex, updatedAt: Date.now() })
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [persistedKey, dashHex, backHex]);

  return (
    <ThemeContext.Provider value={{ dashHex, backHex, setDashHex, setBackHex }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
