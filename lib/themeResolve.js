import { normalizeHex } from './colour.js';

function pickHex(...candidates) {
  for (const value of candidates) {
    const hex = normalizeHex(value, '');
    if (hex) return hex;
  }
  return '';
}

function asTime(value) {
  const time = Number(value);
  return Number.isFinite(time) && time > 0 ? time : 0;
}

/**
 * Newest browser write wins over a history snapshot and the profile shell.
 * Snapshots and RSC payloads can lag a colour save by a full session.
 */
export function resolvePaintTheme({ snapshot, shell, persisted } = {}) {
  const persistedAt = asTime(persisted?.updatedAt);
  const snapshotAt = asTime(snapshot?.updatedAt);
  const usePersisted = Boolean(persisted) && persistedAt >= snapshotAt;

  if (usePersisted) {
    return {
      dashHex: pickHex(persisted.dashHex, snapshot?.dashHex, shell?.dashHex),
      backHex: pickHex(persisted.backHex, snapshot?.backHex, shell?.backHex),
    };
  }

  return {
    dashHex: pickHex(snapshot?.dashHex, persisted?.dashHex, shell?.dashHex),
    backHex: pickHex(snapshot?.backHex, persisted?.backHex, shell?.backHex),
  };
}

/** Remote/RSC theme applies only when it is at least as new as the local write. */
export function remoteThemeIsCurrent(remoteUpdatedAt, persistedUpdatedAt) {
  return asTime(remoteUpdatedAt) >= asTime(persistedUpdatedAt);
}
