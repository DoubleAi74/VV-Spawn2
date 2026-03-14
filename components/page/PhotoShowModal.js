"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Download,
  FileText,
} from "lucide-react";
import { buildRenderableRichText } from "@/lib/richText";

const R2_DOMAIN = process.env.NEXT_PUBLIC_R2_DOMAIN;

// Mirrors cloudflareLoader exactly — same URL means browser cache hits when
// navigating from a post card into the modal.
function getDisplayUrl(src) {
  if (!src) return src;
  try {
    const path = new URL(src).pathname;
    return `${R2_DOMAIN}/cdn-cgi/image/quality=75,format=webp${path}`;
  } catch {
    return src;
  }
}

export default function PhotoShowModal({
  post,
  posts = [],
  onClose,
  onNavigate,
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const renderedDescription = useMemo(
    () => buildRenderableRichText(post?.description || ""),
    [post?.description],
  );
  const descriptionRef = useRef(null);
  const typesetterRef = useRef(null);
  const typesetRafRef = useRef(null);
  const typesetResizeTimerRef = useRef(null);

  const currentIdx = useMemo(
    () => posts.findIndex((item) => item._id === post._id),
    [posts, post._id],
  );
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < posts.length - 1;

  const isUrlPost = post.content_type === "url";
  const isFilePost = post.content_type === "file";
  const displayImageUrl =
    post.thumbnail || (post.content_type === "photo" ? post.content : "");
  const thumbUrl = post.thumbnail || "";
  const openUrl =
    isUrlPost || isFilePost
      ? post.content || ""
      : post.content || post.thumbnail || "";
  const downloadUrl = isUrlPost
    ? ""
    : (isFilePost ? post.content : post.content || post.thumbnail) || "";

  useEffect(() => {
    setIsLoaded(false);
    setThumbnailLoaded(false);
  }, [post._id]);

  const getDescriptionBlocks = useCallback(() => {
    const container = descriptionRef.current;
    if (!container) return [];
    return Array.from(container.querySelectorAll("p, li, blockquote"));
  }, []);

  const clearTypesetting = useCallback(() => {
    const typesetter = typesetterRef.current;
    if (!typesetter) return;

    const blocks = getDescriptionBlocks();
    blocks.forEach((block) => {
      if (typeof typesetter.unjustifyContent === "function") {
        typesetter.unjustifyContent(block);
      }
      const originalWhiteSpace = block.dataset.texOriginalWhitespace;
      block.style.whiteSpace =
        originalWhiteSpace !== undefined ? originalWhiteSpace : "";
      delete block.dataset.texOriginalWhitespace;
      block.style.width = "";
      block.style.maxWidth = "";
    });
  }, [getDescriptionBlocks]);

  const getTypesetter = useCallback(async () => {
    if (typesetterRef.current) {
      return typesetterRef.current;
    }

    const [texModule, patternsModule] = await Promise.all([
      import("tex-linebreak"),
      import("hyphenation.en-us"),
    ]);

    const tex = texModule.default || texModule.texLineBreak_lib || texModule;
    const patterns = patternsModule.default || patternsModule;
    typesetterRef.current = {
      justifyContent: tex.justifyContent,
      unjustifyContent: tex.unjustifyContent,
      hyphenate: tex.createHyphenator(patterns),
    };

    return typesetterRef.current;
  }, []);

  useEffect(() => {
    if (!renderedDescription.hasContent) return;

    let cancelled = false;

    const applyTypesetting = async () => {
      let blocks = getDescriptionBlocks();
      if (blocks.length === 0) return;

      const typesetter = await getTypesetter();
      if (cancelled) return;

      blocks = getDescriptionBlocks();
      if (blocks.length === 0) return;

      clearTypesetting();

      blocks.forEach((block) => {
        block.dataset.texOriginalWhitespace = block.style.whiteSpace || "";
        block.style.width = "100%";
        block.style.maxWidth = "100%";
      });

      if (
        typeof typesetter.justifyContent === "function" &&
        typeof typesetter.hyphenate === "function"
      ) {
        typesetter.justifyContent(blocks, typesetter.hyphenate);
      } else {
        throw new Error(
          "tex-linebreak API unavailable in current module format",
        );
      }
    };

    const scheduleTypesetting = () => {
      if (typesetRafRef.current) {
        cancelAnimationFrame(typesetRafRef.current);
      }
      typesetRafRef.current = requestAnimationFrame(() => {
        applyTypesetting().catch((error) => {
          console.error("Typesetting failed:", error);
          clearTypesetting();
        });
      });
    };

    scheduleTypesetting();

    const handleResize = () => {
      if (typesetResizeTimerRef.current) {
        clearTimeout(typesetResizeTimerRef.current);
      }
      typesetResizeTimerRef.current = setTimeout(scheduleTypesetting, 120);
    };

    const observerTarget = descriptionRef.current;
    const resizeObserver =
      observerTarget && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            handleResize();
          })
        : null;

    if (resizeObserver && observerTarget) {
      resizeObserver.observe(observerTarget);
    }

    window.addEventListener("resize", handleResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", handleResize);
      if (resizeObserver) resizeObserver.disconnect();
      if (typesetRafRef.current) {
        cancelAnimationFrame(typesetRafRef.current);
        typesetRafRef.current = null;
      }
      if (typesetResizeTimerRef.current) {
        clearTimeout(typesetResizeTimerRef.current);
        typesetResizeTimerRef.current = null;
      }
      clearTypesetting();
    };
  }, [
    renderedDescription.hasContent,
    renderedDescription.html,
    getDescriptionBlocks,
    getTypesetter,
    clearTypesetting,
  ]);

  const handlePrev = useCallback(() => {
    if (hasPrev) onNavigate(posts[currentIdx - 1]);
  }, [hasPrev, onNavigate, posts, currentIdx]);

  const handleNext = useCallback(() => {
    if (hasNext) onNavigate(posts[currentIdx + 1]);
  }, [hasNext, onNavigate, posts, currentIdx]);

  useEffect(() => {
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handlePrev, handleNext, onClose]);

  async function handleDownload(targetUrl) {
    if (!targetUrl) return;
    try {
      const res = await fetch(targetUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = post.title || "download";
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[220] bg-black/35 backdrop-blur-[1px] flex items-center justify-center p-2 sm:p-4"
      aria-label="Image lightbox"
    >
      <div
        className="p-0 rounded-lg shadow-2xl overflow-hidden w-[95vw] md:w-[80vw] max-w-none md:max-w-5xl h-full max-h-[80vh] bg-neutral-900 border border-neutral-800 text-neutral-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col w-full h-full max-h-[80vh] bg-neutral-900 border border-neutral-800 text-neutral-100 rounded-lg overflow-hidden">
          <div className="flex shrink-0 justify-between items-center px-2 py-2 border-b border-neutral-800 bg-neutral-900 z-10">
            <h2 className="ml-3 pr-4 text-base sm:text-lg font-medium tracking-wide text-neutral-200 break-words leading-tight min-w-0">
              {post.title}
            </h2>

            <div className="flex items-center gap-2 shrink-0">
              {isUrlPost && openUrl && (
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center sm:justify-end px-2 py-1 sm:space-x-2 text-sm text-neutral-200 hover:text-neutral-100 bg-emerald-800/70 hover:bg-emerald-800 rounded-[3px] border border-emerald-800 focus:outline-none"
                >
                  <p className="hidden sm:block">Open Link</p>
                  <ExternalLink size={15} />
                </a>
              )}
              {!isUrlPost && openUrl && (
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center sm:justify-end px-2 py-1 sm:space-x-2 text-sm text-neutral-200 hover:text-neutral-100 bg-emerald-800/70 hover:bg-emerald-800 rounded-[3px] border border-emerald-800 focus:outline-none"
                >
                  <p className="hidden sm:block">Open</p>
                  <ExternalLink size={15} />
                </a>
              )}
              {downloadUrl && (
                <button
                  type="button"
                  onClick={() => handleDownload(downloadUrl)}
                  className="grid place-items-center sm:flex sm:items-center sm:justify-end px-2 py-1 sm:space-x-2 text-sm text-neutral-200 hover:text-neutral-100 bg-cyan-900/80 hover:bg-cyan-800 mr-[14px] rounded-[3px] border border-cyan-900 focus:outline-none"
                >
                  <p className="hidden sm:block">Download</p>
                  <Download size={15} />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex items-center ml-[10px] focus:outline-none space-x-2 px-2 py-1 text-sm text-neutral-400 bg-neutral-800 hover:bg-neutral-700 rounded-[3px] transition-all border border-neutral-700"
              >
                <p>Close</p>
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="relative bg-black select-none flex justify-center items-center overflow-hidden h-[65vh] w-full">
              {post.blurDataURL && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.blurDataURL}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 w-full h-full object-contain opacity-100"
                />
              )}

              {thumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getDisplayUrl(thumbUrl)}
                  alt=""
                  aria-hidden
                  onLoad={() => setThumbnailLoaded(true)}
                  className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${
                    thumbnailLoaded ? "opacity-100" : "opacity-0"
                  }`}
                />
              )}

              {displayImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getDisplayUrl(displayImageUrl)}
                  alt={post.title || ""}
                  onLoad={() => setIsLoaded(true)}
                  className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ease-out ${
                    isLoaded ? "opacity-100" : "opacity-0"
                  }`}
                />
              )}
              {!displayImageUrl && (
                <div className="absolute inset-0 grid place-items-center">
                  <FileText className="w-8 h-8 text-white/35" />
                </div>
              )}

              {hasPrev && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrev();
                  }}
                  className="absolute group flex justify-start items-end w-2/5 h-1/3 left-0 bottom-0 z-20 px-4 py-2 hover:bg-black/5 rounded-tr-md transition-colors duration-200"
                >
                  <div className="flex items-center justify-center w-8 h-8 bg-black/20 rounded-md text-white/40 group-hover:text-white/90 transition-colors duration-200">
                    <ChevronLeft className="w-5 h-5" />
                  </div>
                </button>
              )}

              {hasNext && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNext();
                  }}
                  className="absolute group flex justify-end items-end w-2/5 h-1/3 right-0 bottom-0 z-20 px-4 py-2 hover:bg-black/5 rounded-tl-md transition-colors duration-200"
                >
                  <div className="flex items-center justify-center w-8 h-8 bg-black/20 rounded-md text-white/40 group-hover:text-white/90 transition-colors duration-200">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </button>
              )}
            </div>

            <div className="bg-neutral-900 border-t border-neutral-800 py-4 overflow-x-hidden">
              <div className="w-full px-5 sm:px-8 md:px-[87px]">
                {renderedDescription.hasContent ? (
                  <article
                    ref={descriptionRef}
                    lang="en"
                    className="
                      rich-text-content mx-auto w-full min-w-0 max-w-none overflow-x-hidden
                      prose prose-sm sm:prose-base prose-invert max-w-none
                      text-left whitespace-normal break-normal [text-wrap:pretty]
                      [word-break:normal] [overflow-wrap:normal] [hyphens:manual]
                      prose-p:my-2 prose-p:leading-7 prose-p:text-neutral-300 first:[&_p]:mt-[-3px]
                      prose-headings:mb-3 prose-headings:mt-0 prose-headings:font-medium prose-headings:text-neutral-100
                      prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                      prose-strong:font-semibold prose-strong:text-neutral-100
                      prose-em:text-neutral-200
                      prose-ul:my-3 prose-ol:my-3 prose-li:my-1
                      prose-a:text-sky-300 prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-sky-200
                      [&_a]:[overflow-wrap:anywhere]
                    "
                    dangerouslySetInnerHTML={{
                      __html: renderedDescription.html,
                    }}
                  />
                ) : (
                  <div className="text-sm font-light text-neutral-400 leading-relaxed w-full mx-auto">
                    <span className="italic opacity-50">...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
