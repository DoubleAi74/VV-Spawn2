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
export function useQueue(onQueueIdle) {
  const [isSyncing, setIsSyncing] = useState(false);

  // Active create slots
  const activeCreates = useRef(0);
  // Queue for serialised update/delete ops
  const serialQueue = useRef([]);
  const serialRunning = useRef(false);
  const pendingOperations = useRef(0);

  const updateSyncState = useCallback(() => {
    setIsSyncing(
      pendingOperations.current > 0 ||
        activeCreates.current > 0 ||
        serialRunning.current ||
        serialQueue.current.length > 0
    );
  }, []);

  const finishOperation = useCallback(async () => {
    pendingOperations.current = Math.max(0, pendingOperations.current - 1);
    updateSyncState();

    if (pendingOperations.current === 0 && onQueueIdle) {
      try {
        await onQueueIdle();
      } catch (error) {
        console.error('Queue idle callback failed:', error);
      }
    }
  }, [onQueueIdle, updateSyncState]);

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
      } finally {
        await finishOperation();
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
      await finishOperation();
    }
  }

  const enqueue = useCallback((op) => {
    pendingOperations.current++;
    updateSyncState();

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
  }, [updateSyncState]); // eslint-disable-line react-hooks/exhaustive-deps

  return { enqueue, isSyncing };
}
