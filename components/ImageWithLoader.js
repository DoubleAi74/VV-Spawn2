'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

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
}) {
  const srcKey = makeSrcKey(src);
  const [isLoading, setIsLoading] = useState(() => (srcKey ? !loadedSrcCache.has(srcKey) : false));
  const [shouldAnimateReveal, setShouldAnimateReveal] = useState(() =>
    Boolean(srcKey) && !loadedSrcCache.has(srcKey)
  );
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const needsFirstReveal = srcKey ? !loadedSrcCache.has(srcKey) : false;
    setIsLoading(needsFirstReveal);
    setShouldAnimateReveal(needsFirstReveal);
    setHasError(false);
  }, [srcKey]);

  const handleLoadingComplete = useCallback(() => {
    rememberLoadedSrc(srcKey);
    setIsLoading(false);
  }, [srcKey]);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  const shouldUseNextBlur = Boolean(useNextBlurPlaceholder && blurDataURL && isLoading);
  const revealClassName = shouldAnimateReveal
    ? blurDataURL
      ? `transition-opacity duration-700 ease-out will-change-[opacity] ${
          isLoading ? 'opacity-0' : 'opacity-100'
        }`
      : `transition-[opacity,filter] duration-700 ease-out will-change-[opacity,filter] ${
          isLoading ? 'opacity-0 blur-[10px]' : 'opacity-100 blur-0'
        }`
    : '';

  const imageProps = {
    src,
    priority,
    onLoadingComplete: handleLoadingComplete,
    onError: handleError,
    style,
    className: `${className} ${revealClassName}`.trim(),
    ...(shouldUseNextBlur ? { placeholder: 'blur', blurDataURL } : { placeholder: 'empty' }),
  };

  return (
    <div className="relative w-full h-full">
      {hasError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-800/60">
          <div className="w-6 h-6 text-neutral-300/70">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
        </div>
      ) : fill ? (
        <Image {...imageProps} alt={alt || ''} fill sizes={sizes} />
      ) : (
        <Image {...imageProps} alt={alt || ''} width={width} height={height} sizes={sizes} />
      )}
    </div>
  );
}
