'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { fitHtmlFrame, INFO_FRAME_MIN_HEIGHT } from '@/lib/fitHtmlFrame';

const BLANK_BASE = '<base target="_blank">';
// Long enough for a slow srcdoc parse, short enough not to strand the reveal.
const PENDING_TIMEOUT_MS = 3000;

function asSrcDoc(html) {
  const source = String(html || '');
  if (/<head[\s>]/i.test(source)) {
    return source.replace(/<head([^>]*)>/i, `<head$1>${BLANK_BASE}`);
  }
  if (/<html[\s>]/i.test(source)) {
    return source.replace(/<html([^>]*)>/i, `<html$1><head>${BLANK_BASE}</head>`);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${BLANK_BASE}</head><body>${source}</body></html>`;
}

function openHrefInNewTab(href) {
  try {
    const url = new URL(href, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.hash && url.pathname === window.location.pathname && url.origin === window.location.origin) {
      return;
    }
    window.open(url.href, '_blank', 'noopener,noreferrer');
  } catch {
    // Ignore unparseable hrefs.
  }
}

/**
 * Renders owner-authored HTML with its own CSS, isolated from the host page.
 * Height grows to the document so the host page scrolls, not the iframe.
 * `allow-same-origin` is required to measure that height; scripts stay off.
 */
export default function EmbeddedHtmlFrame({
  html,
  title = 'Dashboard info',
  initialHeight,
  onHeight,
}) {
  const frameRef = useRef(null);
  const onHeightRef = useRef(onHeight);
  onHeightRef.current = onHeight;
  const startHeight = Number(initialHeight);
  const knownHeight =
    Number.isFinite(startHeight) && startHeight > 0 ? Math.round(startHeight) : 0;
  // Read inside the effect without re-attaching the observers every time a
  // fit reports a new height back up to the snapshot.
  const knownHeightRef = useRef(knownHeight);
  knownHeightRef.current = knownHeight;
  const [measuredHeight, setMeasuredHeight] = useState(null);

  const fit = useCallback(() => {
    const height = fitHtmlFrame(frameRef.current);
    if (height === null) return false;
    setMeasuredHeight(height);
    onHeightRef.current?.(height);
    return true;
  }, []);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    const attach = () => {
      if (!fit()) return undefined;
      const doc = frame.contentDocument;

      const ro = new ResizeObserver(() => fit());
      ro.observe(doc.documentElement);
      if (doc.body) ro.observe(doc.body);

      const onAsset = () => fit();
      window.addEventListener('resize', onAsset);
      doc.querySelectorAll('img').forEach((img) => {
        if (!img.complete) img.addEventListener('load', onAsset);
      });

      const onClick = (event) => {
        const anchor = event.target?.closest?.('a[href]');
        if (!anchor) return;
        event.preventDefault();
        event.stopPropagation();
        openHrefInNewTab(anchor.getAttribute('href'));
      };
      doc.addEventListener('click', onClick, true);

      return () => {
        ro.disconnect();
        window.removeEventListener('resize', onAsset);
        doc.removeEventListener('click', onClick, true);
        doc.querySelectorAll('img').forEach((img) => {
          img.removeEventListener('load', onAsset);
        });
      };
    };

    let detach;
    const onLoad = () => {
      detach?.();
      detach = attach();
    };
    frame.addEventListener('load', onLoad);
    // Hydration may happen after srcdoc has already loaded. In that case fit
    // before React's next paint; otherwise the load handler does the first fit.
    detach = attach();
    // srcdoc has not parsed yet. A height this frame measured on an earlier
    // mount is a better placeholder than the pending flag, which holds the
    // dashboard's loading cover over content that is otherwise ready. The real
    // measurement still corrects it once the load handler fires.
    if (!detach && knownHeightRef.current) setMeasuredHeight(knownHeightRef.current);
    // The pending flag holds a cover up on the dashboard and the whole body
    // back on a page. A frame whose srcdoc never loads must not hide either of
    // them for good; give up waiting and show what we have.
    const giveUp = setTimeout(() => {
      setMeasuredHeight(current =>
        current ?? (knownHeightRef.current || INFO_FRAME_MIN_HEIGHT));
    }, PENDING_TIMEOUT_MS);
    return () => {
      clearTimeout(giveUp);
      frame.removeEventListener('load', onLoad);
      detach?.();
    };
  }, [html, fit]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={asSrcDoc(html)}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      scrolling="no"
      data-info-pending={measuredHeight === null ? '' : undefined}
      aria-busy={measuredHeight === null}
      className="block w-full border-0 bg-transparent"
      style={{
        minHeight: INFO_FRAME_MIN_HEIGHT,
        height: measuredHeight ?? (knownHeight || INFO_FRAME_MIN_HEIGHT),
        overflow: 'hidden',
      }}
    />
  );
}
