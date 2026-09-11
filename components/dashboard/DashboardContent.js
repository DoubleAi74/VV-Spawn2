'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/** One loading surface for the fallback and the live dashboard's first paint. */
export default function DashboardContent({ backHex, loading = false, className, children }) {
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
    const hasPendingInfo = () => Boolean(main.querySelector('iframe[data-info-pending]'));
    const prepare = () => {
      cancelReveal();
      if (loading || hasPendingInfo()) {
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
  }, [loading]);

  return (
    <div className="dashboard-body" data-ready={ready} style={{ backgroundColor: backHex }}>
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
