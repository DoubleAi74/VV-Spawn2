/**
 * When a press on a card may commit the route, and when it must wait.
 *
 * Dashboard cards start their route on `pointerdown` rather than on click, so
 * `loading.js` is not gated behind the release. That is safe for a mouse — a
 * mouse-down on a card is always a click — and wrong for a finger, because
 * `pointerdown` fires the instant it touches the glass, before the browser
 * knows whether the gesture is a tap or the start of a scroll. Routing there
 * made the dashboard effectively un-scrollable on a phone: every drag that
 * began on a card navigated away.
 *
 * Touch and pen therefore fall through to `click`, which the browser withholds
 * when the press turns into a scroll. That arbitration accounts for momentum,
 * pinch, long-press and second fingers in a way a distance threshold here
 * could not, and it costs only the duration of the finger contact — the
 * `touchstart` prefetch has already put the payload in flight. An absent or
 * unrecognised `pointerType` takes the same safe path, so the fallback is the
 * one that cannot strand a scroll.
 */
export function shouldRouteOnPress(event) {
  if (!event || event.pointerType !== 'mouse') return false;
  // A non-primary button is a context menu or a paste, not an open.
  if (event.button !== 0) return false;
  // Modified clicks belong to the <Link>, which opens them in a new tab.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  return true;
}

/**
 * Whether a press should seed the route-transition snapshot.
 *
 * Same rule, minus the modifiers: a cmd-click still opens the page, just in a
 * new tab, and seeding costs a `sessionStorage` write plus a listener sweep.
 * Paying that on a touch that turns out to be a scroll spends the main thread
 * at the exact moment the scroll needs it.
 */
export function shouldSeedOnPress(event) {
  return Boolean(event) && event.pointerType === 'mouse';
}
