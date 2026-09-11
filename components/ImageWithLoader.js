'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { CARD_IMAGE_WIDTH, withImageBucket } from '@/lib/cloudflareLoader';
import { decodeImage } from '@/lib/decodeImage';

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

export default function ImageWithLoader({ src, bucket = CARD_IMAGE_WIDTH, ...props }) {
  // A new source gets fresh decode/error state, including when an editor
  // switches back to an image that was displayed earlier.
  const bucketedSrc = withImageBucket(src, bucket);
  return <DecodedImage key={makeSrcKey(bucketedSrc)} {...props} src={bucketedSrc} />;
}

function DecodedImage({
  src: bucketedSrc,
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
  const srcKey = makeSrcKey(bucketedSrc);
  // Seen-this-tab skips the fade; each new element still needs decoded pixels.
  const [readySrc, setReadySrc] = useState(null);
  const [animateReveal, setAnimateReveal] = useState(false);
  const [failedSrc, setFailedSrc] = useState(null);
  const imageRef = useRef(null);
  const initiallyCompleteRef = useRef(false);
  const decodeRef = useRef(null);
  const ready = Boolean(srcKey) && readySrc === srcKey;
  const hasError = Boolean(srcKey) && failedSrc === srcKey;

  const prepareImage = useCallback(
    (img, alreadyLoaded = false) => {
      if (!img?.complete || img.naturalWidth <= 0 || decodeRef.current?.img === img) return;
      const task = { img };
      decodeRef.current = task;
      decodeImage(img).then((decoded) => {
        // A decode can finish after a source change or unmount.
        if (imageRef.current !== img || decodeRef.current !== task) return;
        if (!decoded) {
          setFailedSrc(srcKey);
          return;
        }
        setAnimateReveal(!alreadyLoaded && !loadedSrcCache.has(srcKey));
        rememberLoadedSrc(srcKey);
        setReadySrc(srcKey);
      });
    },
    [srcKey],
  );

  const bindImage = useCallback((img) => {
    imageRef.current = img;
    decodeRef.current = null;
    initiallyCompleteRef.current = Boolean(img?.complete && img.naturalWidth > 0);
    // Next Image reassigns src in its own ref after this callback, which can
    // abort a decode started here. Its onLoad also handles cached images;
    // wait for that callback before decoding this element.
  }, []);

  const handleLoad = useCallback((event) => {
    prepareImage(event.currentTarget, initiallyCompleteRef.current);
  }, [prepareImage]);

  const handleError = useCallback(() => {
    setFailedSrc(srcKey);
  }, [srcKey]);

  const shouldUseNextBlur = Boolean(useNextBlurPlaceholder && blurDataURL && !ready);
  // The page is already readable while photos sharpen over their previews.
  const revealClassName = [
    ready ? 'opacity-100' : 'opacity-0',
    animateReveal
      ? 'transition-opacity duration-150 ease-out motion-reduce:transition-none'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const imageProps = {
    ref: bindImage,
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
        <Image key={srcKey} {...imageProps} alt={alt || ''} fill sizes={sizes} />
      ) : (
        <Image key={srcKey} {...imageProps} alt={alt || ''} width={width} height={height} sizes={sizes} />
      )}
    </div>
  );
}
