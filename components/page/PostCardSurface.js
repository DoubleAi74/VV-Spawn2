"use client";

import { FileText, Link2, Loader2 } from "lucide-react";
import ImageWithLoader from "@/components/ImageWithLoader";

/** Shared appearance for the live post button and its static loading preview. */
export default function PostCardSurface({
  as: Tag = "div",
  post,
  priority = false,
  className = "",
  ...props
}) {
  const isOptimistic = Boolean(post._optimistic);

  function renderThumbnail() {
    if (isOptimistic && !post.thumbnail && !post.blurDataURL) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 size={24} className="text-neutral-200/70 animate-spin" />
        </div>
      );
    }

    if (post.thumbnail) {
      return (
        <ImageWithLoader
          src={post.thumbnail}
          alt={post.title || ""}
          blurDataURL={post.blurDataURL}
          fill
          priority={priority}
          className="object-cover"
        />
      );
    }

    return (
      <div className="w-full h-full bg-neutral-200/70 flex items-center justify-center">
        {post.content_type === "url" ? (
          <Link2 size={28} className="text-neutral-600" />
        ) : post.content_type === "text" || post.content_type === "file" ? (
          <FileText size={28} className="text-neutral-600" />
        ) : (
          <span className="text-neutral-600 text-2xl">
            {post.title?.[0]?.toUpperCase() || "?"}
          </span>
        )}
      </div>
    );
  }

  return (
    <Tag
      {...props}
      className={`w-full min-w-0 max-w-full overflow-hidden p-1 rounded-[2px] bg-white/70 shadow-lg border-[2px] border-neutral-900/25 h-full flex flex-col text-left text-neutral-800/80 ${className}`}
    >
      <div
        className="w-full aspect-[4/3] rounded-sm overflow-hidden relative"
        style={{
          backgroundImage: post.blurDataURL
            ? `url("${post.blurDataURL}")`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: !post.blurDataURL ? "#a3a3a3" : undefined,
        }}
      >
        {renderThumbnail()}

        {isOptimistic && post.blurDataURL && !post.thumbnail && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-neutral-200/30 border-t-white/40 rounded-full animate-spin" />
          </div>
        )}
      </div>

      <div className="px-1 pt-[4px] w-full min-w-0 max-w-full overflow-hidden">
        <div
          className="block truncate text-xs font-bold text-black/90 group-hover:text-black"
          title={post.title || undefined}
        >
          {post.title || "\u00A0"}
        </div>
      </div>
    </Tag>
  );
}
