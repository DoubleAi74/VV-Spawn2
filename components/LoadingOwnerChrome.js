'use client';

import { Edit2, LogOut, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * The owner controls, painted from the transition snapshot so the header
 * does not pop them in after the session hydrates.
 */
export default function LoadingOwnerChrome({ email, variant = "dashboard" }) {
  const isPage = variant === "page";

  // Page views always show the density control; owner chrome adds Edit/Logout.
  const density = (
    <div
      className="flex flex-col overflow-hidden rounded-none border border-white/20 bg-white/10"
      aria-hidden
    >
      <div className="h-5 w-9 grid place-items-center text-white/80">
        <ChevronUp size={16} />
      </div>
      <div className="h-5 w-9 grid place-items-center border-t border-white/20 text-white/80">
        <ChevronDown size={16} />
      </div>
    </div>
  );

  if (!isPage) {
    if (!email) return null;
    return (
      <div
        className="flex items-center gap-2 shrink-0 pointer-events-none"
        aria-hidden
      >
        <div className="h-8 w-8 sm:h-9 sm:w-[67px] rounded-[3px] border border-white/20 bg-white/10 text-white/80 inline-flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5">
            <Edit2 size={14} />
            <span className="hidden sm:inline">Edit</span>
          </span>
        </div>
        <div className="h-8 w-8 sm:h-9 sm:w-9 grid place-items-center rounded-[3px] border border-white/20 bg-white/10 text-white/80">
          <LogOut size={15} />
        </div>
      </div>
    );
  }

  // Page: density is always present. Owner extras only when the snapshot says so.
  return (
    <div
      className="flex items-center gap-2 shrink-0 pointer-events-none"
      aria-hidden
    >
      {email ? (
        <>
          <span className="text-white/65 text-xs hidden md:block truncate max-w-[160px]">
            {email}
          </span>
          {density}
          <div className="h-8 w-[67px] rounded-[3px] border border-white/20 bg-white/10 text-white/80 text-sm font-medium inline-flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5">
              <Edit2 size={14} />
              <span>Edit</span>
            </span>
          </div>
          <div className="h-8 w-8 grid place-items-center rounded-[3px] border border-white/20 bg-white/10 text-white/80">
            <LogOut size={15} />
          </div>
        </>
      ) : (
        density
      )}
    </div>
  );
}
