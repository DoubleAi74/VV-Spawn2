'use client';

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { normalizeHex } from '@/lib/colour';

const ThemeContext = createContext(null);

export function ThemeProvider({ children, initialDashHex, initialBackHex, storageKey }) {
  const [dashHex, setDashHexState] = useState(initialDashHex || '#2d3e50');
  const [backHex, setBackHexState] = useState(initialBackHex || '#e5e7eb');
  // The poll exists to propagate colour changes, and only the owner can make
  // one, and only in edit mode. Everyone else — including the owner reading
  // their own page — gets the colours from the server render and, across tabs,
  // from the `storage` listener below. The view clients own edit mode, so they
  // switch this on; see useThemeSync.
  const [syncEnabled, setSyncEnabled] = useState(false);
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
    if (!storageKey || !syncEnabled) return;

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
        // The hold is checked again here, not only before the fetch. A request
        // takes long enough that the user can pick a colour while it is in
        // flight, and applying the server's answer afterwards silently threw
        // that pick away — most easily hit right after entering edit mode,
        // which is when the poll starts and when someone reaches for the
        // picker.
        if (Date.now() < localHoldUntilRef.current) return;
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
  }, [storageKey, applyTheme, syncEnabled]);

  const value = useMemo(
    () => ({ dashHex, backHex, setDashHex, setBackHex, setSyncEnabled }),
    [dashHex, backHex, setDashHex, setBackHex]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Turn the background theme sync on while the viewer can actually change the
 * colours. Call it from the view that owns edit mode.
 */
export function useThemeSync(enabled) {
  const { setSyncEnabled } = useTheme();
  useEffect(() => {
    setSyncEnabled(Boolean(enabled));
    return () => setSyncEnabled(false);
  }, [enabled, setSyncEnabled]);
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
