/**
 * One pending viewport restore for same-route `router.refresh()`.
 * Lives at module scope so a remount cannot drop it.
 *
 * Restore only if the viewport was reset to 0. If the owner has scrolled
 * since capture, they own the viewport — including create-then-delete.
 */

let pending = null;
let stopListening = null;

export function shouldRestoreScroll(savedY, currentY) {
  if (!Number.isFinite(savedY) || savedY <= 0) return false;
  if (!Number.isFinite(currentY) || currentY < 0) return false;
  if (currentY === savedY) return false;
  return currentY === 0;
}

function unlisten() {
  if (!stopListening) return;
  stopListening();
  stopListening = null;
}

function listenForUserScroll() {
  if (typeof window === 'undefined' || stopListening) return;
  const onUser = () => {
    pending = null;
    unlisten();
  };
  // wheel / touchmove are user intent. `scroll` also fires for programmatic
  // resets, which would cancel the restore we are trying to apply.
  window.addEventListener('wheel', onUser, { capture: true, passive: true });
  window.addEventListener('touchmove', onUser, { capture: true, passive: true });
  stopListening = () => {
    window.removeEventListener('wheel', onUser, { capture: true });
    window.removeEventListener('touchmove', onUser, { capture: true });
  };
}

export function capturePendingScroll(generation) {
  if (typeof window === 'undefined') return;
  pending = { y: window.scrollY, generation };
  listenForUserScroll();
}

export function cancelPendingScroll() {
  pending = null;
  unlisten();
}

/** Consume the pending restore. Null if it must not run. */
export function takePendingScroll(currentGeneration) {
  const held = pending;
  if (!held) return null;
  if (held.generation !== currentGeneration) {
    cancelPendingScroll();
    return null;
  }
  const currentY = typeof window === 'undefined' ? 0 : window.scrollY;
  if (!shouldRestoreScroll(held.y, currentY)) {
    cancelPendingScroll();
    return null;
  }
  const y = held.y;
  cancelPendingScroll();
  return y;
}
