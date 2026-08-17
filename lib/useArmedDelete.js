'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Long enough to reach the button deliberately, short enough that the armed
// state never survives the user's attention moving elsewhere.
const DISARM_AFTER_MS = 3000;

/**
 * useArmedDelete — the two-tap delete guard, with a way back out.
 *
 * The interaction is unchanged: the first tap arms, the second deletes. What
 * was missing is every way of *not* going through with it. The armed state was
 * cleared only by `onMouseLeave`, which no touch device fires the way a mouse
 * does — so the armed state either persisted indefinitely, and a stray tap
 * minutes later deleted the item, or (measured in Chrome's touch emulation,
 * where a lifted finger does synthesise one) it was cleared in the same commit
 * that set it, and the button could not be armed at all.
 *
 * It now disarms on a timeout, on a pointer down anywhere outside the button,
 * and on scroll. A tap on the button itself is excluded from the outside-tap
 * rule, or the second tap would disarm the state it is meant to act on.
 *
 * Returns `buttonRef` for that exclusion, `isArmed` so the caller can change
 * both the icon and the accessible name, and `handlePointerLeave` for the card
 * root — see below for why that one cannot be a mouse event.
 */
export function useArmedDelete(disarmAfterMs = DISARM_AFTER_MS) {
  const [isArmed, setIsArmed] = useState(false);
  const buttonRef = useRef(null);

  const disarm = useCallback(() => setIsArmed(false), []);
  const arm = useCallback(() => setIsArmed(true), []);

  /**
   * Replaces the card's `onMouseLeave`, and must stay a *pointer* event.
   *
   * Measured in Chrome with touch emulation: a tap fires the compatibility
   * mouse sequence and then `mouseout` and `mouseleave` the instant the finger
   * lifts — so the card's old `onMouseLeave` disarmed the button in the same
   * commit that armed it, and on a touch device the delete could not be armed
   * at all. `pointerleave` carries `pointerType`, so a real mouse leaving the
   * card still disarms and a lifted finger does not.
   */
  const handlePointerLeave = useCallback(
    (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      disarm();
    },
    [disarm]
  );

  useEffect(() => {
    if (!isArmed) return undefined;

    const timer = setTimeout(disarm, disarmAfterMs);
    const handlePointerDown = (event) => {
      if (buttonRef.current?.contains(event.target)) return;
      disarm();
    };

    // Capture, so a handler that stops propagation cannot leave the button
    // armed behind a tap the user has already moved on from.
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('scroll', disarm, { capture: true, passive: true });

    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('scroll', disarm, { capture: true, passive: true });
    };
  }, [isArmed, disarm, disarmAfterMs]);

  return { isArmed, arm, disarm, handlePointerLeave, buttonRef };
}
