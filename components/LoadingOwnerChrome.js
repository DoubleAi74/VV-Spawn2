'use client';

import { Edit2, LogOut } from 'lucide-react';

/**
 * The owner controls, painted from the transition snapshot so the header
 * does not pop them in after the session hydrates.
 */
export default function LoadingOwnerChrome({ email, variant = "dashboard" }) {
  if (!email) return null;

  const isPage = variant === "page";

  return (
    <div
      className="flex items-center gap-2 shrink-0 pointer-events-none"
      aria-hidden
    >
      <div
        className={
          isPage
            ? "h-8 w-[67px] rounded-[3px] border border-white/20 bg-white/10 text-white/80 text-sm font-medium inline-flex items-center justify-center"
            : "h-8 w-8 sm:h-9 sm:w-[67px] rounded-[3px] border border-white/20 bg-white/10 text-white/80 inline-flex items-center justify-center"
        }
      >
        <span className="inline-flex items-center gap-1.5">
          <Edit2 size={14} />
          {isPage ? (
            <span>Edit</span>
          ) : (
            <span className="hidden sm:inline">Edit</span>
          )}
        </span>
      </div>
      <div
        className={
          isPage
            ? "h-8 w-8 grid place-items-center rounded-[3px] border border-white/20 bg-white/10 text-white/80"
            : "h-8 w-8 sm:h-9 sm:w-9 grid place-items-center rounded-[3px] border border-white/20 bg-white/10 text-white/80"
        }
      >
        <LogOut size={15} />
      </div>
    </div>
  );
}
