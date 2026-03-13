'use client';

import { useState } from 'react';
import {
  Link2,
  FileText,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Loader2,
  X,
} from 'lucide-react';
import ImageWithLoader from '@/components/ImageWithLoader';

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
}) {
  const [deletePrime, setDeletePrime] = useState(false);
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
          alt={post.title || ''}
          blurDataURL={post.blurDataURL}
          fill
          className="object-cover"
        />
      );
    }

    if (post.content_type === 'url') {
      return (
        <div className="w-full h-full bg-neutral-200/70 flex items-center justify-center">
          <Link2 size={28} className="text-neutral-600" />
        </div>
      );
    }

    if (post.content_type === 'text') {
      return (
        <div className="w-full h-full bg-neutral-200/70 flex items-center justify-center">
          <FileText size={28} className="text-neutral-600" />
        </div>
      );
    }

    if (post.content_type === 'file') {
      return (
        <div className="w-full h-full bg-neutral-200/70 flex items-center justify-center">
          <FileText size={28} className="text-neutral-600" />
        </div>
      );
    }

    return (
      <div className="w-full h-full bg-neutral-200/70 flex items-center justify-center">
        <span className="text-neutral-600 text-2xl">{post.title?.[0]?.toUpperCase() || '?'}</span>
      </div>
    );
  }

  const handleClick = () => {
    if (!onClick) return;
    onClick(post);
  };

  return (
    <div
      className={`group relative transition-opacity duration-200 ${isOptimistic ? 'opacity-75' : 'opacity-100'}`}
      onMouseLeave={() => setDeletePrime(false)}
    >
      <button
        type="button"
        onClick={handleClick}
        className="w-full p-1 rounded-[2px] bg-neutral-200/60 shadow-lg hover:bg-neutral-300/50 border-[3px] border-neutral-800/20 transition-all duration-100 cursor-pointer h-full flex flex-col text-neutral-800/80 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-700"
        aria-label={`Open: ${post.title || post.content_type}`}
      >
        <div
          className="w-full aspect-[4/3] rounded-sm overflow-hidden relative"
          style={{
            backgroundImage: post.blurDataURL ? `url("${post.blurDataURL}")` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: !post.blurDataURL ? '#a3a3a3' : undefined,
          }}
        >
          {renderThumbnail()}

          {isOptimistic && post.blurDataURL && !post.thumbnail && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-neutral-200/30 border-t-white/40 rounded-full animate-spin" />
            </div>
          )}
        </div>

        <div className="px-1 pt-[4px] truncate text-xs font-bold">{post.title || '\u00A0'}</div>
      </button>

      {isOwner && isEditMode && !isOptimistic && (
        <>
          <div className="absolute bottom-[10px] left-[10px] flex gap-1 opacity-70 group-hover:opacity-100 transition-all duration-200">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(post);
              }}
              className="group p-2 rounded-[3px] bg-neutral-700/70 shadow-md hover:bg-neutral-700/90"
              aria-label="Edit post"
            >
              <Pencil className="w-4 h-4 text-neutral-100/70 group-hover:text-neutral-100/90" />
            </button>
          </div>

          <div className="absolute top-[10px] right-[10px] flex gap-1 opacity-70 group-hover:opacity-100 transition-all duration-200">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!deletePrime) {
                  setDeletePrime(true);
                } else {
                  onDelete(post);
                  setDeletePrime(false);
                }
              }}
              className={`group p-2 rounded-[3px] shadow-md ${
                deletePrime ? 'bg-[#610e19]/90 hover:bg-[#610e19]/100' : 'bg-[#610e19]/40 hover:bg-[#610e19]/60'
              }`}
              aria-label="Delete post"
            >
              {deletePrime ? (
                <X className="w-4 h-4 text-neutral-100/70 group-hover:text-neutral-100/90" />
              ) : (
                <Trash2 className="w-4 h-4 text-neutral-100/70 group-hover:text-neutral-100/90" />
              )}
            </button>
          </div>

          <div className="absolute bottom-1/2 translate-y-1/2 w-full px-[10px] flex justify-between opacity-70 group-hover:opacity-100 transition-all duration-200">
            {!isFirst && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMoveLeft(post);
                }}
                className="group p-[2px] rounded-[2px] shadow-sm mb-3 bg-neutral-700/70 hover:bg-neutral-700/90"
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
                className="group p-[2px] rounded-[2px] shadow-sm mt-3 bg-neutral-700/70 hover:bg-neutral-700/90"
                aria-label="Move right"
              >
                <ChevronRight className="w-7 h-7 text-neutral-100/70 group-hover:text-neutral-100/90" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
