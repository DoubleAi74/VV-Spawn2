'use client';

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';

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
  const localHoldUntilRef = useRef(0);
  const persistedKey = useMemo(
    () => (storageKey ? `volvox_theme_${storageKey}` : ''),
    [storageKey]
  );

  const setDashHex = useCallback((hex) => {
    localHoldUntilRef.current = Date.now() + 3000;
    setDashHexState(hex);
  }, []);

  const setBackHex = useCallback((hex) => {
    localHoldUntilRef.current = Date.now() + 3000;
    setBackHexState(hex);
  }, []);

  const applyTheme = useCallback((nextDash, nextBack) => {
    const safeDash = normalizeHex(nextDash, '');
    const safeBack = normalizeHex(nextBack, '');
    if (safeDash) setDashHexState((current) => (current === safeDash ? current : safeDash));
    if (safeBack) setBackHexState((current) => (current === safeBack ? current : safeBack));
  }, []);

  useEffect(() => {
    if (!persistedKey) return;
    try {
      const raw = window.localStorage.getItem(persistedKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      applyTheme(parsed?.dashHex, parsed?.backHex);
    } catch {
      // Ignore malformed local storage payloads.
    }
    // Intentionally run once per key so server props can be overridden by freshest client value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedKey]);

  useEffect(() => {
    applyTheme(initialDashHex, initialBackHex);
  }, [initialDashHex, initialBackHex, applyTheme]);

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

  useEffect(() => {
    if (!persistedKey) return;

    function handleStorage(event) {
      if (event.key !== persistedKey || !event.newValue) return;

      try {
        const parsed = JSON.parse(event.newValue);
        applyTheme(parsed?.dashHex, parsed?.backHex);
      } catch {
        // Ignore malformed storage payloads.
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [persistedKey, applyTheme]);

  useEffect(() => {
    if (!storageKey) return;

    let isCancelled = false;

    async function syncFromServer() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      if (Date.now() < localHoldUntilRef.current) {
        return;
      }

      try {
        const res = await fetch(`/api/theme/${encodeURIComponent(storageKey)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;

        const data = await res.json();
        if (isCancelled) return;
        applyTheme(data?.dashHex, data?.backHex);
      } catch {
        // Ignore background sync failures.
      }
    }

    const intervalId = window.setInterval(() => {
      syncFromServer();
    }, 10000);

    function handleFocus() {
      syncFromServer();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        syncFromServer();
      }
    }

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    syncFromServer();

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [storageKey, applyTheme]);

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
