"use client";

import Link from "next/link";
import {
  Lock,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  FileText,
  X,
} from "lucide-react";
import ImageWithLoader from "@/components/ImageWithLoader";
import { useArmedDelete } from "@/lib/useArmedDelete";

export default function PageCard({
  page,
  href,
  isOwner,
  isEditMode,
  onNavigate,
  onOpen,
  onPrefetch,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  priority = false,
}) {
  const {
    isArmed: deletePrime,
    arm: armDelete,
    disarm: disarmDelete,
    handlePointerLeave,
    buttonRef: deleteButtonRef,
  } = useArmedDelete();
  const isOptimistic = Boolean(page._optimistic);

  function handleNavigate() {
    if (isOptimistic) return;
    onNavigate?.();
  }

  function handlePointerDown(event) {
    handleNavigate();
    if (
      !href ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    // Start the route on press, not on release, so loading.js is not gated
    // behind the click. Modified clicks stay with the <Link> (new tab).
    onOpen?.();
  }

  function handlePrefetch() {
    if (isOptimistic) return;
    onPrefetch?.();
  }

  const openClassName = `block w-full text-left p-2 pb-[3px]  rounded-[2px] border-[2px] border-neutral-900/25 bg-white/70 shadow-md h-full transition-[color,background-color,transform,opacity] duration-[60ms] ease-out ${
    isOptimistic || !href
      ? "cursor-default"
      : "cursor-pointer group-hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-neutral-700 active:scale-[0.995] active:opacity-80"
  }`;

  const openLabel = `Open page: ${page.title}`;

  const cardBody = (
    <>
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

      <div className="flex pl-1 pr-1 items-center justify-between gap-1 h-8 w-full overflow-hidden">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {page.isPrivate && isOwner && (
            <Lock
              size={12}
              className="text-neutral-600 shrink-0"
              aria-label="Private page"
            />
          )}
          <h3
            className="min-w-0 flex-1 font-bold text-black/90 group-hover:text-black text-sm leading-snug line-clamp-2 break-words"
            title={page.title}
          >
            {page.title}
          </h3>
        </div>

        {page.description && (
          <p className="shrink-0 max-w-[45%] text-xs text-neutral-700/80 text-right leading-snug line-clamp-2">
            {page.description}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div
      className={`group relative transition-opacity duration-300 ${isOptimistic ? "opacity-75" : "opacity-100"}`}
      onPointerLeave={handlePointerLeave}
    >
      {isOptimistic || !href ? (
        <div className={openClassName} aria-label={openLabel} aria-disabled>
          {cardBody}
        </div>
      ) : (
        <Link
          href={href}
          prefetch={false}
          onClick={handleNavigate}
          onPointerDown={handlePointerDown}
          onMouseEnter={handlePrefetch}
          onFocus={handlePrefetch}
          onTouchStart={handlePrefetch}
          className={openClassName}
          aria-label={openLabel}
        >
          {cardBody}
        </Link>
      )}

      {isOwner && isEditMode && !isOptimistic && (
        <div className="absolute top-[10px] left-[10px] right-[10px] aspect-[4/3] z-10 pointer-events-none">
          <div className="touch-controls absolute bottom-[4px] left-[4px] pointer-events-auto flex gap-1 opacity-70 group-hover:opacity-100 transition-all duration-200">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(page);
              }}
              className="touch-target group p-2 rounded-[3px] bg-neutral-700/70 shadow-md hover:bg-neutral-700/90"
              aria-label="Edit page"
            >
              <Pencil className="w-4 h-4 text-neutral-100/70 group-hover:text-neutral-100/90" />
            </button>
          </div>

          <div className="touch-controls absolute top-[4px] right-[4px] pointer-events-auto flex gap-1 opacity-70 group-hover:opacity-100 transition-all duration-200">
            <button
              type="button"
              ref={deleteButtonRef}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!deletePrime) {
                  armDelete();
                } else {
                  onDelete(page);
                  disarmDelete();
                }
              }}
              className={`touch-target group p-2 rounded-[3px] shadow-md ${
                deletePrime
                  ? "bg-[#610e19]/90 hover:bg-[#610e19]/100"
                  : "bg-[#610e19]/40 hover:bg-[#610e19]/60"
              }`}
              // Deleting a page takes every post and file inside it with it, so
              // the armed state says that rather than only turning red.
              aria-label={
                deletePrime
                  ? `Confirm deleting "${page.title || "this page"}" and everything in it`
                  : "Delete page"
              }
              aria-pressed={deletePrime}
            >
              {deletePrime ? (
                <X className="w-4 h-4 text-neutral-100/70 group-hover:text-neutral-100/90" />
              ) : (
                <Trash2 className="w-4 h-4 text-neutral-100/70 group-hover:text-neutral-100/90" />
              )}
            </button>
          </div>

          <div className="touch-controls absolute top-1/2 -translate-y-1/2 left-[4px] right-[4px] flex justify-between opacity-70 group-hover:opacity-100 transition-all duration-200">
            {!isFirst && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMoveUp(page);
                }}
                className="touch-target pointer-events-auto group p-[2px] rounded-[2px] shadow-sm mb-3 bg-neutral-700/70 hover:bg-neutral-700/90"
                aria-label="Move page up"
              >
                <ChevronLeft className="w-7 h-7 text-neutral-100/70 group-hover:text-neutral-100/90" />
              </button>
            )}
            {isFirst && <div />}
            {!isLast && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMoveDown(page);
                }}
                className="touch-target pointer-events-auto group p-[2px] rounded-[2px] shadow-sm mt-3 bg-neutral-700/70 hover:bg-neutral-700/90"
                aria-label="Move page down"
              >
                <ChevronRight className="w-7 h-7 text-neutral-100/70 group-hover:text-neutral-100/90" />
              </button>
            )}
          </div>
        </div>
      )}

      {isOptimistic && (
        <div className="absolute inset-0 rounded-[4px] bg-black/10 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 border-2 border-neutral-200/50 border-t-white/70 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
