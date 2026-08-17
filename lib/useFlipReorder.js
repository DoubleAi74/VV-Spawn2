'use client';

import { useCallback, useEffect, useRef } from 'react';
import { REORDER_DURATION_MS, REORDER_EASING, prefersReducedMotion } from '@/lib/motion';

/**
 * useFlipReorder — animates a grid's reflow after its order changes.
 *
 * FLIP: measure where the cards are, let React commit the new order, measure
 * again, then start each card from where it used to be and let it travel to
 * where it now is. `moveByOffset` already wraps its state update in `flushSync`
 * (a sequencing requirement, not a visual one), which is what makes the second
 * measurement available immediately rather than a frame later.
 *
 * Cards are identified by `data-flip-key` on their root element. That is an
 * attribute rather than a wrapper element on purpose: an extra div between the
 * grid and its cards would change the layout it is supposed to be describing.
 *
 * Web Animations, not CSS, so the animation can be cancelled mid-flight when a
 * second click arrives — and so `prefers-reduced-motion` has to be read here,
 * since the media query in globals.css cannot reach it.
 *
 *   const flip = useFlipReorder(gridRef);
 *   flip.capture();
 *   flushSync(() => setPages(next));
 *   flip.play();
 */
export function useFlipReorder(containerRef) {
  const previousRectsRef = useRef(null);
  const animationsRef = useRef(new Map());

  const capture = useCallback(() => {
    previousRectsRef.current = null;
    const container = containerRef.current;
    if (!container || prefersReducedMotion()) return;

    const rects = new Map();
    for (const el of container.querySelectorAll('[data-flip-key]')) {
      // Deliberately the *visual* box, transform included: a card moved again
      // mid-animation should continue from where the eye last saw it, not jump
      // back to where the layout says it was.
      rects.set(el.dataset.flipKey, el.getBoundingClientRect());
    }
    previousRectsRef.current = rects;
  }, [containerRef]);

  const play = useCallback(() => {
    const container = containerRef.current;
    const previous = previousRectsRef.current;
    previousRectsRef.current = null;
    if (!container || !previous) return;

    // Clear any running animation first, so the "after" measurement below is
    // the layout position and not a position part-way through an old move.
    for (const animation of animationsRef.current.values()) animation.cancel();
    animationsRef.current.clear();

    for (const el of container.querySelectorAll('[data-flip-key]')) {
      const key = el.dataset.flipKey;
      const before = previous.get(key);
      if (!before) continue;

      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      // Sub-pixel drift is not a move.
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      const animation = el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0px, 0px)' },
        ],
        { duration: REORDER_DURATION_MS, easing: REORDER_EASING }
      );
      animationsRef.current.set(key, animation);
      animation.finished
        .then(() => {
          if (animationsRef.current.get(key) === animation) {
            animationsRef.current.delete(key);
          }
        })
        .catch(() => {
          // Cancelled by a later move. Nothing to clean up — WAAPI removes the
          // transform itself, and the newer animation owns the map entry.
        });
    }
  }, [containerRef]);

  useEffect(
    () => () => {
      for (const animation of animationsRef.current.values()) animation.cancel();
      animationsRef.current.clear();
    },
    []
  );

  return { capture, play };
}
