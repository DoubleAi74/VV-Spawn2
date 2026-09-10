"use client";

import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import PostCardSurface from "@/components/page/PostCardSurface";
import { useArmedDelete } from "@/lib/useArmedDelete";

/** Same destination the lightbox Open control uses (modal stays download-only). */
function postOpenUrl(post) {
  if (!post) return "";
  if (post.content_type === "text") return "";
  if (post.content_type === "url" || post.content_type === "file") {
    return post.content || "";
  }
  return post.content || post.thumbnail || "";
}

export default function PostCard({
  post,
  isOwner,
  isEditMode,
  onClick,
  onEdit,
  onDelete,
  onMoveLeft,
  onMoveRight,
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
  const isOptimistic = Boolean(post._optimistic);
  const openUrl = postOpenUrl(post);

  const handleClick = () => {
    if (!onClick) return;
    onClick(post);
  };

  return (
    <div
      className={`group relative min-w-0 w-full transition-opacity duration-200 ${isOptimistic ? "opacity-75" : "opacity-100"}`}
      onPointerLeave={handlePointerLeave}
    >
      <PostCardSurface
        as="button"
        post={post}
        priority={priority}
        type="button"
        disabled={isOptimistic}
        onClick={handleClick}
        className={`transition-[color,background-color,transform,opacity] duration-[60ms] ease-out ${
          isOptimistic
            ? "cursor-default"
            : "cursor-pointer hover:bg-white/80 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-700 active:scale-[0.995] active:opacity-80"
        }`}
        aria-label={`Open: ${post.title || post.content_type}`}
        aria-disabled={isOptimistic}
      />

      {openUrl && !isOptimistic && (
        <div className="absolute top-[6px] left-[6px] right-[6px] aspect-[4/3] z-20 pointer-events-none">
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="touch-controls pointer-events-auto absolute top-[10px] left-1/2 -translate-x-1/2 w-[min(100%-0.5rem,10.5rem)] max-w-[calc(100%-0.5rem)] justify-center flex items-center px-3 sm:px-5 py-2.5 rounded-[2px] bg-neutral-950/20 hover:bg-neutral-950/45 text-white/80 hover:text-white text-[15px] font-semibold tracking-wide shadow-sm backdrop-blur-[1px] border border-white/25 hover:border-white/40 opacity-0 group-hover:opacity-55 hover:!opacity-100 focus-visible:opacity-100 transition-[opacity,background-color,border-color,color] duration-150"
            aria-label={`Open: ${post.title || "post"}`}
          >
            Open
          </a>
        </div>
      )}

      {isOptimistic && (
        <div className="absolute inset-0 rounded-[2px] bg-black/10 flex items-center justify-center pointer-events-none">
          <div className="rounded-[3px] bg-neutral-900/55 px-2 py-1 text-[11px] font-medium tracking-wide text-white/85">
            Saving...
          </div>
        </div>
      )}

      {isOwner && isEditMode && !isOptimistic && (
        <div className="absolute top-[6px] left-[6px] right-[6px] aspect-[4/3] z-10 pointer-events-none">
          <div className="touch-controls absolute bottom-[4px] left-[4px] pointer-events-auto flex gap-1 opacity-70 group-hover:opacity-100 transition-all duration-200">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(post);
              }}
              className="touch-target group p-2 rounded-[3px] bg-neutral-700/70 shadow-md hover:bg-neutral-700/90"
              aria-label="Edit post"
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
                  onDelete(post);
                  disarmDelete();
                }
              }}
              className={`touch-target group p-2 rounded-[3px] shadow-md ${
                deletePrime
                  ? "bg-[#610e19]/90 hover:bg-[#610e19]/100"
                  : "bg-[#610e19]/40 hover:bg-[#610e19]/60"
              }`}
              // The armed state is announced, not only coloured: the second tap
              // is the destructive one and a screen reader has no other way to
              // know that.
              aria-label={
                deletePrime
                  ? `Confirm deleting this post${post.title ? `: ${post.title}` : ""}`
                  : "Delete post"
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
                  onMoveLeft(post);
                }}
                className="touch-target pointer-events-auto group p-[2px] rounded-[2px] shadow-sm mb-3 bg-neutral-700/70 hover:bg-neutral-700/90"
                aria-label="Move left"
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
                  onMoveRight(post);
                }}
                className="touch-target pointer-events-auto group p-[2px] rounded-[2px] shadow-sm mt-3 bg-neutral-700/70 hover:bg-neutral-700/90"
                aria-label="Move right"
              >
                <ChevronRight className="w-7 h-7 text-neutral-100/70 group-hover:text-neutral-100/90" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
