/**
 * lib/motion.js — the durations, and the one place that asks whether to move.
 *
 * `app/globals.css` honours `prefers-reduced-motion` for everything driven by
 * CSS. Anything animating from JavaScript asks here instead.
 *
 * No imports, so a plain-node test can load it.
 */

// Matches the modal-panel-out keyframes in app/globals.css. The unmount is
// delayed by exactly this much, so the two must not drift apart.
export const MODAL_EXIT_MS = 140;

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
