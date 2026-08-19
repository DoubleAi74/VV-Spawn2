'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { CARD_IMAGE_WIDTH, withImageBucket } from '@/lib/cloudflareLoader';

const loadedSrcCache = new Set();
const MAX_LOADED_SRC_CACHE = 800;

function makeSrcKey(src) {
  if (!src) return '';
  if (typeof src === 'string') return src;
  if (typeof src === 'object' && src && typeof src.src === 'string') return src.src;
  return String(src);
}

function rememberLoadedSrc(srcKey) {
  if (!srcKey || loadedSrcCache.has(srcKey)) return;
  loadedSrcCache.add(srcKey);

  // Keep cache bounded so long sessions don't grow this unboundedly.
  if (loadedSrcCache.size > MAX_LOADED_SRC_CACHE) {
    const oldest = loadedSrcCache.values().next().value;
    if (oldest) loadedSrcCache.delete(oldest);
  }
}

export default function ImageWithLoader({
  src,
  alt,
  blurDataURL,
  fill = true,
  width,
  height,
  sizes = '(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw',
  className = '',
  style = {},
  priority = false,
  useNextBlurPlaceholder = false,
  bucket = CARD_IMAGE_WIDTH,
}) {
  // Every consumer of this component renders a grid card, so the card bucket is
  // the default; the lightbox builds its own URLs and does not come through here.
  const bucketedSrc = withImageBucket(src, bucket);
  const srcKey = makeSrcKey(bucketedSrc);
  // Seen-this-tab only skips the fade. The <img> still starts invisible until
  // this element's decoder actually has pixels (complete + naturalWidth).
  const [readySrc, setReadySrc] = useState(null);
  const [animateReveal, setAnimateReveal] = useState(
    () => Boolean(srcKey) && !loadedSrcCache.has(srcKey),
  );
  const [hasError, setHasError] = useState(false);
  const ready = Boolean(srcKey) && readySrc === srcKey;

  useEffect(() => {
    setAnimateReveal(Boolean(srcKey) && !loadedSrcCache.has(srcKey));
    setHasError(false);
  }, [srcKey]);

  const markReady = useCallback(() => {
    rememberLoadedSrc(srcKey);
    setReadySrc(srcKey);
  }, [srcKey]);

  const bindWrap = useCallback(
    (el) => {
      if (!el || !srcKey) return;
      const check = () => {
        const img = el.querySelector('img');
        if (img?.complete && img.naturalWidth > 0) markReady();
      };
      check();
      requestAnimationFrame(check);
    },
    [srcKey, markReady],
  );

  const handleLoad = useCallback(() => {
    markReady();
  }, [markReady]);

  const handleError = useCallback(() => {
    setHasError(true);
    setReadySrc(srcKey);
  }, [srcKey]);

  const shouldUseNextBlur = Boolean(useNextBlurPlaceholder && blurDataURL && !ready);
  // 700ms read as sluggish on a grid where twenty images reveal at once, and
  // PERF-1 made it worse: the card bucket decodes fast enough that the reveal
  // is now most of the delay the user perceives, not a fraction of it.
  const revealClassName = [
    ready ? 'opacity-100' : 'opacity-0',
    animateReveal
      ? blurDataURL
        ? 'transition-opacity duration-300 ease-out will-change-[opacity]'
        : `transition-[opacity,filter] duration-300 ease-out will-change-[opacity,filter] ${
            ready ? 'blur-0' : 'blur-[10px]'
          }`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const imageProps = {
    src: bucketedSrc,
    priority,
    // `priority` alone only makes next/image emit a ReactDOM.preload; the
    // fetchpriority hint on both the <img> and that preload comes from this.
    ...(priority ? { fetchPriority: 'high' } : {}),
    // `onLoadingComplete` is deprecated in Next 15 and logged a warning for
    // every image on every render in development.
    onLoad: handleLoad,
    onError: handleError,
    style,
    className: `${className} ${revealClassName}`.trim(),
    ...(shouldUseNextBlur ? { placeholder: 'blur', blurDataURL } : { placeholder: 'empty' }),
  };

  return (
    <div ref={bindWrap} className="relative w-full h-full">
      {hasError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800/60">
          <div className="w-6 h-6 text-neutral-300/70">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
        </div>
      ) : fill ? (
        <Image key={srcKey} {...imageProps} alt={alt || ''} fill sizes={sizes} />
      ) : (
        <Image key={srcKey} {...imageProps} alt={alt || ''} width={width} height={height} sizes={sizes} />
      )}
    </div>
  );
}
