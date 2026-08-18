'use client';

import { useCallback, useEffect, useRef } from 'react';

const BLANK_BASE = '<base target="_blank">';

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
  const fittedOnceRef = useRef(false);

  const fit = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.documentElement) return;

    // Zeroing on the first pass would collapse a snapshot height and dip the grid.
    if (fittedOnceRef.current || !knownHeight) {
      frame.style.height = '0px';
    }
    const height = Math.max(
      doc.documentElement.scrollHeight,
      doc.body?.scrollHeight || 0,
      doc.documentElement.offsetHeight,
      doc.body?.offsetHeight || 0,
      knownHeight || 40,
    );
    frame.style.height = `${height}px`;
    fittedOnceRef.current = true;
    onHeightRef.current?.(height);
  }, [knownHeight]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    const attach = () => {
      fit();
      const doc = frame.contentDocument;
      if (!doc) return undefined;

      const ro = new ResizeObserver(() => fit());
      ro.observe(doc.documentElement);
      if (doc.body) ro.observe(doc.body);

      const onAsset = () => fit();
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
        doc.removeEventListener('click', onClick, true);
        doc.querySelectorAll('img').forEach((img) => {
          img.removeEventListener('load', onAsset);
        });
      };
    };

    let detach = attach();
    const onLoad = () => {
      detach?.();
      detach = attach();
    };
    frame.addEventListener('load', onLoad);
    return () => {
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
      className="block w-full border-0 bg-transparent"
      style={{
        minHeight: knownHeight || 40,
        height: knownHeight || undefined,
        overflow: 'hidden',
      }}
    />
  );
}
