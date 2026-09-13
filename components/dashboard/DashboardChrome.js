"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Keep the dashboard header in the visual viewport on iOS Chrome.
 * Sticky flex items there can sit under the URL bar or drop out of flow
 * after the title wraps; fixed + an in-flow spacer does not.
 */
export default function DashboardChrome({ dashHex, children }) {
  const chromeRef = useRef(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const chrome = chromeRef.current;
    if (!chrome) return undefined;

    const applyHeight = () => {
      const next = chrome.offsetHeight;
      setHeight((current) => (current === next ? current : next));
    };

    const applyViewportTop = () => {
      const offset = window.visualViewport
        ? Math.max(0, window.visualViewport.offsetTop)
        : 0;
      chrome.style.setProperty(
        "--dashboard-chrome-top",
        `${Math.round(offset)}px`,
      );
    };

    applyHeight();
    applyViewportTop();

    // A reload can land just past the chrome so the body looks headerless.
    const limit = chrome.offsetHeight + 24;
    if (window.scrollY > 0 && window.scrollY <= limit) {
      window.scrollTo(0, 0);
    }

    const ro = new ResizeObserver(applyHeight);
    ro.observe(chrome);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", applyViewportTop);
    vv?.addEventListener("scroll", applyViewportTop);
    window.addEventListener("scroll", applyViewportTop, { passive: true });

    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", applyViewportTop);
      vv?.removeEventListener("scroll", applyViewportTop);
      window.removeEventListener("scroll", applyViewportTop);
    };
  }, []);

  return (
    <>
      <div
        className="dashboard-chrome-spacer"
        style={{
          backgroundColor: dashHex,
          ...(height > 0 ? { height } : {}),
        }}
        aria-hidden="true"
      />
      <div
        ref={chromeRef}
        className="dashboard-chrome"
        style={{ backgroundColor: dashHex, width: "100%" }}
      >
        {children}
      </div>
    </>
  );
}
