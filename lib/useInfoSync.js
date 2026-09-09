'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createInfoSync } from './infoSync.js';

/** The caller is keyed by resource id, so drafts and requests cannot cross routes. */
export function useInfoSync({ initialValues, fields, readUrl, writeUrl, canEdit, isEditMode, storageKey }) {
  const restored = useRef(false);
  const wasEditing = useRef(isEditMode);
  const [sync] = useState(() => createInfoSync({
    initialValues,
    fields,
    readUrl,
    writeUrl,
    shouldPoll: () => document.visibilityState !== 'hidden',
    onDraftChange(draft) {
      if (typeof window === 'undefined') return;
      try {
        // Only pending edits are drafts. Saved copies must never override Mongo.
        if (Object.keys(draft).length) {
          window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
        } else {
          window.sessionStorage.removeItem(storageKey);
        }
      } catch {
        // The live editor still works when storage is unavailable or full.
      }
    },
  }));
  const state = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getServerSnapshot);

  useEffect(() => {
    sync.setCanEdit(canEdit);
    if (canEdit && !restored.current) {
      restored.current = true;
      try {
        sync.restoreDraft(JSON.parse(window.sessionStorage.getItem(storageKey)));
      } catch {
        // Ignore malformed browser storage.
      }
    }
    sync.start();
    const resume = () => {
      if (document.visibilityState === 'hidden') return;
      void sync.save();
      void sync.refresh();
    };
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      sync.stop();
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [sync, canEdit, storageKey]);

  useEffect(() => {
    if (wasEditing.current && !isEditMode) void sync.save();
    wasEditing.current = isEditMode;
  }, [sync, isEditMode]);

  return {
    ...state,
    change: sync.change,
    statusFor(text, mode) {
      if (state.saving) return 'Saving...';
      if (state.pending.includes(text) || state.pending.includes(mode)) {
        return state.error || 'Unsaved';
      }
      return 'Saved';
    },
  };
}
