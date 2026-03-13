'use client';

import { useRef, useState, useCallback } from 'react';

const MAX_CONCURRENT_CREATES = 3;

/**
 * useQueue — manages an optimistic operation queue.
 *
 * Create operations: parallelised (max 3 concurrent).
 * Update / Delete operations: serialised (one at a time).
 *
 * Each operation:
 *   { type: 'create'|'update'|'delete', fn: async () => any, onRollback?: () => void }
 *
 * Returns { enqueue, isSyncing }
 */
export function useQueue() {
  const [isSyncing, setIsSyncing] = useState(false);

  // Active create slots
  const activeCreates = useRef(0);
  // Queue for serialised update/delete ops
  const serialQueue = useRef([]);
  const serialRunning = useRef(false);

  const updateSyncState = useCallback(() => {
    setIsSyncing(activeCreates.current > 0 || serialRunning.current);
  }, []);

  async function runSerial() {
    if (serialRunning.current) return;
    serialRunning.current = true;
    updateSyncState();

    while (serialQueue.current.length > 0) {
      const op = serialQueue.current.shift();
      try {
        await op.fn();
      } catch (err) {
        console.error('Queue operation failed:', err);
        if (op.onRollback) op.onRollback();
      }
    }

    serialRunning.current = false;
    updateSyncState();
  }

  async function runCreate(op) {
    activeCreates.current++;
    updateSyncState();
    try {
      await op.fn();
    } catch (err) {
      console.error('Create operation failed:', err);
      if (op.onRollback) op.onRollback();
    } finally {
      activeCreates.current--;
      updateSyncState();
    }
  }

  const enqueue = useCallback((op) => {
    if (op.type === 'create') {
      if (activeCreates.current < MAX_CONCURRENT_CREATES) {
        runCreate(op);
      } else {
        // Defer to serial queue when at capacity
        serialQueue.current.push(op);
        runSerial();
      }
    } else {
      // update / delete — always serialised
      serialQueue.current.push(op);
      runSerial();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { enqueue, isSyncing };
}
