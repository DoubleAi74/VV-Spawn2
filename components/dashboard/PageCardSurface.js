"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { FileText, Lock } from "lucide-react";
import ImageWithLoader from "@/components/ImageWithLoader";

/** Shared appearance for a live page link and its non-interactive loading preview. */
export default function PageCardSurface({
  as: Tag = "div",
  page,
  isOwner = false,
  priority = false,
  className = "",
  ...props
}) {
  const titleBoxRef = useRef(null);
  const measureRef = useRef(null);
  const [titleWraps, setTitleWraps] = useState(false);

  useLayoutEffect(() => {
    const box = titleBoxRef.current;
    const probe = measureRef.current;
    if (!box || !probe) return;

    const measure = () => {
      // Measure the text slot, excluding the optional lock and description.
      const width = probe.parentElement?.clientWidth ?? 0;
      if (width <= 0) return;

      probe.style.width = `${width}px`;
      probe.style.fontSize = "0.875rem";
      probe.style.lineHeight = "1.375";
      const lh = parseFloat(getComputedStyle(probe).lineHeight);
      const wraps =
        Number.isFinite(lh) && lh > 0 && probe.scrollHeight > lh * 1.85;
      probe.style.width = "";
      probe.style.fontSize = "";
      probe.style.lineHeight = "";
      setTitleWraps(wraps);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    if (probe.parentElement) ro.observe(probe.parentElement);
    return () => ro.disconnect();
  }, [page.title, page.description, page.isPrivate, isOwner]);

  return (
    <Tag
      {...props}
      className={`block w-full text-left p-2 pb-[3px] rounded-[2px] border-[2px] border-neutral-900/25 bg-white/70 shadow-md h-full ${className}`}
    >
      {page.thumbnail || page.blurDataURL ? (
        <div
          className="w-full aspect-[4/3] mb-1 rounded-sm shadow-md overflow-hidden relative"
          style={{
            backgroundImage: page.blurDataURL
              ? `url("${page.blurDataURL}")`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundColor: !page.blurDataURL ? "#cccccc" : undefined,
          }}
        >
          {page.thumbnail && (
            <ImageWithLoader
              src={page.thumbnail}
              alt={page.title}
              blurDataURL={page.blurDataURL}
              fill
              priority={priority}
              className="object-cover"
            />
          )}
        </div>
      ) : (
        <div className="w-full aspect-[4/3] shadow-sm mb-1 rounded-sm bg-zinc-200/50 flex items-center justify-center">
          <FileText className="w-8 h-8 text-neutral-500" />
        </div>
      )}

      <div className="flex pl-1 pr-1 items-center justify-between gap-1 h-9 w-full">
        <div
          ref={titleBoxRef}
          className="relative flex items-center gap-1 min-w-0 flex-1 h-full py-0.5"
        >
          {page.isPrivate && isOwner && (
            <Lock
              size={12}
              className="text-neutral-600 shrink-0"
              aria-label="Private page"
            />
          )}
          <div className="relative min-w-0 flex-1 h-full flex items-center">
            <h3
              className={`min-w-0 w-full font-bold text-black/90 group-hover:text-black line-clamp-2 break-words [overflow-wrap:anywhere] ${
                titleWraps ? "text-xs leading-snug" : "text-sm leading-snug"
              }`}
              title={page.title}
            >
              {page.title}
            </h3>
            {/* Unclamped twin measures wrapping at the normal font size. */}
            <span
              ref={measureRef}
              aria-hidden
              className="pointer-events-none invisible absolute left-0 top-0 -z-10 w-full font-bold text-sm leading-snug break-words [overflow-wrap:anywhere]"
            >
              {page.title}
            </span>
          </div>
        </div>

        {page.description && (
          <p className="shrink-0 max-w-[45%] self-center text-xs text-neutral-700/80 text-right leading-snug line-clamp-2">
            {page.description}
          </p>
        )}
      </div>
    </Tag>
  );
}
