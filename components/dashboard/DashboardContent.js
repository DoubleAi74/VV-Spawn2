'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDashboardReturn } from '@/context/DashboardNavigationContext';
import { INFO_FRAME_MIN_HEIGHT } from '@/lib/fitHtmlFrame';
import { hasRevealed, markRevealed } from '@/lib/revealedRoutes';

/** One loading surface for the fallback and the live dashboard's first paint. */
export default function DashboardContent({ backHex, loading = false, revealKey, className, children }) {
  const isDashboardReturn = useDashboardReturn();
  const mainRef = useRef(null);
  const [prepared, setPrepared] = useState(false);
  const ready = !loading && prepared;

  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return undefined;
    let firstFrame;
    let secondFrame;

    const cancelReveal = () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
    const pendingFrames = () => main.querySelectorAll('iframe[data-info-pending]');
    const hasPendingInfo = () => pendingFrames().length > 0;
    // A frame still at the floor has no remembered height, so it has nothing
    // to show and the stylesheet holds the cover up regardless of data-ready.
    // One already sized drops its flag in the commit we are inside.
    const hasUnsizedInfo = () =>
      [...pendingFrames()].some(frame => frame.clientHeight <= INFO_FRAME_MIN_HEIGHT);
    const prepare = () => {
      cancelReveal();
      if (loading) {
        setPrepared(false);
        return;
      }
      // Suspense swapping the skeleton for the live view mounts a second
      // DashboardContent over content the first one already revealed. Covering
      // it again only blinks, so reveal in the layout effect, before the
      // browser can paint the cover. Checked ahead of the pending flag because
      // that clears via a DOM round-trip a paint can beat.
      if (revealKey && hasRevealed(revealKey) && !hasUnsizedInfo()) {
        setPrepared(true);
        return;
      }
      if (hasPendingInfo()) {
        setPrepared(false);
        return;
      }
      // The content remains paintable under the opaque loading layer. Give
      // the fitted iframe and card text a rendering opportunity before lifting
      // that layer; a measured height alone did not prevent empty Safari frames.
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          if (!hasPendingInfo()) setPrepared(true);
        });
      });
    };

    const observer = new MutationObserver(prepare);
    observer.observe(main, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-info-pending'],
    });
    prepare();
    return () => {
      observer.disconnect();
      cancelReveal();
    };
  }, [loading, revealKey]);

  // Recorded after the commit that lifts the cover, so the next mount of this
  // route — the live view taking over from the skeleton — can skip it.
  useEffect(() => {
    if (ready) markRevealed(revealKey);
  }, [ready, revealKey]);

  return (
    <div
      className="dashboard-body"
      data-ready={ready}
      data-show-watermark={!isDashboardReturn}
      style={{ backgroundColor: backHex }}
    >
      <main
        ref={mainRef}
        className={className}
        inert={!ready}
        aria-hidden={!ready}
        aria-busy={!ready}
      >
        {children}
      </main>
      <div
        className="dashboard-loading-surface"
        style={{ backgroundColor: backHex }}
        aria-hidden="true"
      />
    </div>
  );
}
