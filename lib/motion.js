/**
 * lib/motion.js — the durations, and the one place that asks whether to move.
 *
 * `app/globals.css` honours `prefers-reduced-motion` for everything driven by
 * CSS. The reorder reflow is driven by the Web Animations API, which that media
 * query cannot reach, so anything animating from JavaScript asks here instead.
 *
 * No imports, so a plain-node test can load it.
 */

// Long enough to read as a move, short enough not to hold up the next click.
export const REORDER_DURATION_MS = 200;
export const REORDER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

// Matches the modal-panel-out keyframes in app/globals.css. The unmount is
// delayed by exactly this much, so the two must not drift apart.
export const MODAL_EXIT_MS = 140;

// A burst of reorder clicks is one intent. Long enough to catch a fast
// four-click run, short enough that a single click still feels immediate.
export const REORDER_DEBOUNCE_MS = 300;

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
