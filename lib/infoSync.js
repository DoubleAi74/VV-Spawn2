import { infoFieldKeys, normalizeInfoValues, parseInfoPatch } from './infoFields.js';

export const INFO_POLL_MS = 3000;
export const INFO_SAVE_MS = 1500;
const RETRY_MS = 5000;
const REQUEST_TIMEOUT_MS = 15000;

/**
 * One coordinator per dashboard/page. Reads never dirty a field, writes are
 * serial, and an acknowledgement only clears the edits that it actually sent.
 * Different fields merge; simultaneous edits to the same field use the last save.
 */
export function createInfoSync({
  initialValues,
  initialClientValues,
  fields,
  readUrl,
  writeUrl,
  fetcher = (...args) => fetch(...args),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  shouldPoll = () => true,
  onDraftChange = () => {},
}) {
  const keys = infoFieldKeys(fields);
  const serverValues = normalizeInfoValues(initialValues, fields);
  let values = normalizeInfoValues({ ...serverValues, ...initialClientValues }, fields);
  const pending = new Set();
  const versions = Object.fromEntries(keys.map(key => [key, 0]));
  const listeners = new Set();
  let snapshot = { values, pending: [], saving: false, error: '' };
  // Hydration must match the document. Client navigation can start with newer
  // session values while the first authoritative read is still in flight.
  const serverSnapshot = { ...snapshot, values: serverValues };
  let active = false;
  let canEdit = false;
  let pollTimer;
  let saveTimer;
  let reader;
  let writing = false;
  let flushPending = false;
  let epoch = 0;
  let etag = '';

  function draft() {
    return Object.fromEntries([...pending].map(key => [key, values[key]]));
  }

  function publish({ saving = writing, error = snapshot.error } = {}) {
    snapshot = { values, pending: [...pending], saving, error };
    onDraftChange(draft());
    listeners.forEach(listener => listener());
  }

  function receive(data, sentVersions = {}) {
    const incoming = parseInfoPatch(data, fields);
    if (keys.some(key => !Object.hasOwn(incoming, key))) {
      throw new Error('Incomplete info response');
    }
    let changed = false;
    const next = { ...values };
    for (const key of keys) {
      if (Object.hasOwn(sentVersions, key) && versions[key] === sentVersions[key]) {
        pending.delete(key);
        changed = true;
      }
      if (!pending.has(key) && next[key] !== incoming[key]) {
        next[key] = incoming[key];
        changed = true;
      }
    }
    if (changed) {
      values = next;
      publish();
    }
  }

  function scheduleSave(delay = INFO_SAVE_MS) {
    clearTimer(saveTimer);
    if (!active || !canEdit || !pending.size) return;
    saveTimer = setTimer(() => { void save(); }, delay);
  }

  function change(key, value) {
    if (!canEdit || !keys.includes(key) || values[key] === value) return;
    parseInfoPatch({ [key]: value }, fields);
    values = { ...values, [key]: value };
    versions[key]++;
    pending.add(key);
    publish({ error: '' });
    scheduleSave();
  }

  async function refresh() {
    if (!active || reader || writing || !shouldPoll()) return;
    const controller = new AbortController();
    reader = controller;
    const readEpoch = epoch;
    const timeout = setTimer(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetcher(readUrl, {
        cache: 'no-store',
        headers: etag ? { 'If-None-Match': etag } : {},
        signal: controller.signal,
      });
      if (response.status === 304 || !response.ok) return;
      const data = await response.json();
      // A read begun before a save or route departure cannot roll it back.
      if (!active || controller.signal.aborted || readEpoch !== epoch) return;
      receive(data);
      etag = response.headers.get('etag') || '';
    } catch {
      // Background read failures leave the current view and unsaved edits intact.
    } finally {
      clearTimer(timeout);
      if (reader === controller) reader = null;
    }
  }

  async function save() {
    clearTimer(saveTimer);
    if (!active || !canEdit || !pending.size) return;
    if (writing) {
      flushPending = true;
      return;
    }
    writing = true;
    flushPending = false;
    epoch++;
    reader?.abort();
    const patch = draft();
    const sentVersions = Object.fromEntries([...pending].map(key => [key, versions[key]]));
    const controller = new AbortController();
    const timeout = setTimer(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let failed = false;
    let retryable = true;
    publish({ error: '' });
    try {
      const response = await fetcher(writeUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
        signal: controller.signal,
      });
      if (!response.ok) {
        retryable = response.status >= 500 || [408, 429].includes(response.status);
        throw new Error('Failed to save');
      }
      receive(await response.json(), sentVersions);
      etag = '';
    } catch {
      failed = true;
    } finally {
      clearTimer(timeout);
      writing = false;
      publish({ error: failed ? 'Failed to save. Try again.' : '' });
      if (!failed || retryable) {
        scheduleSave(failed ? RETRY_MS : flushPending ? 0 : INFO_SAVE_MS);
      }
    }
  }

  function poll() {
    if (!active) return;
    pollTimer = setTimer(() => {
      void refresh();
      poll();
    }, INFO_POLL_MS);
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setCanEdit(value) {
      canEdit = Boolean(value);
      if (!canEdit) clearTimer(saveTimer);
    },
    restoreDraft(stored) {
      if (!canEdit || !stored || !Object.keys(stored).length) return;
      try {
        const patch = parseInfoPatch(stored, fields);
        Object.entries(patch).forEach(([key, value]) => change(key, value));
      } catch {
        // Ignore malformed browser storage.
      }
    },
    start() {
      if (active) return;
      active = true;
      void refresh();
      poll();
      scheduleSave();
    },
    stop() {
      active = false;
      epoch++;
      clearTimer(pollTimer);
      clearTimer(saveTimer);
      reader?.abort();
      reader = null;
    },
    change,
    refresh,
    save,
  };
}
