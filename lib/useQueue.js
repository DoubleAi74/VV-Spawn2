'use client';

import { useRef, useState, useCallback } from 'react';

const MAX_CONCURRENT_CREATES = 3;

/**
 * useQueue — manages an optimistic operation queue.
 *
 * Create operations: parallelised (max 3 concurrent).
 * Update / Delete operations: serialised (one at a time).
 * Delete operations additionally wait for the in-flight creates to drain, so a
 * delete can never overtake a create for the thing it is deleting (REL-7).
 *
 * Each operation:
 *   { type: 'create'|'update'|'delete', fn: async () => any,
 *     onRollback?: () => void, description?: string }
 *
 * `description` says what the user was trying to do, in their words —
 * "Couldn't save your new page". A failed operation rolls its optimistic state
 * back, and a rollback with no explanation looks exactly like data loss, so
 * every call site is expected to supply one.
 *
 * Returns { enqueue, isSyncing }
 */
export function useQueue(onQueueIdle, onError) {
  const [isSyncing, setIsSyncing] = useState(false);

  // Active create slots
  const activeCreates = useRef(0);
  // Resolvers waiting for the create slots to empty. See waitForCreatesToDrain.
  const createDrainWaiters = useRef([]);
  // Queue for serialised update/delete ops
  const serialQueue = useRef([]);
  const serialRunning = useRef(false);
  const pendingOperations = useRef(0);

  /**
   * Deletes wait for the in-flight creates to finish.
   *
   * Creates run in parallel and deletes run serially, so without this a delete
   * enqueued during an upload burst starts while creates for the thing being
   * deleted are still on the wire — and a post that lands after its page has
   * gone is unreachable, along with the file it points at. The server closes
   * the same race from its own side (createPost re-reads its page after the
   * insert), but this is the half that stops the request being sent at all.
   * See REL-7.
   */
  function waitForCreatesToDrain() {
    if (activeCreates.current === 0) return Promise.resolve();
    return new Promise((resolve) => {
      createDrainWaiters.current.push(resolve);
    });
  }

  function releaseIfCreatesDrained() {
    if (activeCreates.current > 0) return;
    const waiters = createDrainWaiters.current;
    createDrainWaiters.current = [];
    waiters.forEach((resolve) => resolve());
  }

  const updateSyncState = useCallback(() => {
    setIsSyncing(
      pendingOperations.current > 0 ||
        activeCreates.current > 0 ||
        serialRunning.current ||
        serialQueue.current.length > 0
    );
  }, []);

  const reportFailure = useCallback(
    (error, op) => {
      console.error('Queue operation failed:', error);
      if (onError) onError(error, op);
    },
    [onError]
  );

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
        if (op.type === 'delete') await waitForCreatesToDrain();
        await op.fn();
      } catch (err) {
        reportFailure(err, op);
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
      reportFailure(err, op);
      if (op.onRollback) op.onRollback();
    } finally {
      activeCreates.current--;
      releaseIfCreatesDrained();
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
