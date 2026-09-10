"use client";

import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import PageCardSurface from "@/components/dashboard/PageCardSurface";
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

  const openClassName = `transition-[color,background-color,transform,opacity] duration-[60ms] ease-out ${
    isOptimistic || !href
      ? "cursor-default"
      : "cursor-pointer group-hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-neutral-700 active:scale-[0.995] active:opacity-80"
  }`;

  const openLabel = `Open page: ${page.title}`;

  return (
    <div
      className={`group relative transition-opacity duration-300 ${isOptimistic ? "opacity-75" : "opacity-100"}`}
      onPointerLeave={handlePointerLeave}
    >
      {isOptimistic || !href ? (
        <PageCardSurface
          page={page}
          isOwner={isOwner}
          priority={priority}
          className={openClassName}
          aria-label={openLabel}
          aria-disabled
        />
      ) : (
        <PageCardSurface
          as={Link}
          page={page}
          isOwner={isOwner}
          priority={priority}
          href={href}
          prefetch={false}
          onClick={handleNavigate}
          onPointerDown={handlePointerDown}
          onMouseEnter={handlePrefetch}
          onFocus={handlePrefetch}
          onTouchStart={handlePrefetch}
          className={openClassName}
          aria-label={openLabel}
        />
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
