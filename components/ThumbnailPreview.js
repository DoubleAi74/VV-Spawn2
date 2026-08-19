'use client';

import { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Modal thumbnail: keep the <img> invisible until it has decoded, so Firefox
 * does not paint white un-decoded JPEG rows or the alt text while it loads.
 */
export default function ThumbnailPreview({ src }) {
  const [loadedSrc, setLoadedSrc] = useState(null);
  const loaded = Boolean(src) && loadedSrc === src;

  const bindImg = useCallback(
    (el) => {
      if (!el || !src) return;
      if (el.complete && el.naturalWidth > 0) setLoadedSrc(src);
    },
    [src],
  );

  if (!src) return null;

  return (
    <div className="relative w-full h-full bg-neutral-950">
      {!loaded ? (
        <div className="absolute inset-0 grid place-items-center" aria-hidden>
          <Loader2
            size={16}
            strokeWidth={1.75}
            className="animate-spin text-white/35"
          />
        </div>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        ref={bindImg}
        src={src}
        alt=""
        onLoad={() => setLoadedSrc(src)}
        onError={() => setLoadedSrc(src)}
        className={`w-full h-full object-cover ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
