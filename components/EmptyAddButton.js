'use client';

import { Plus } from 'lucide-react';

export default function EmptyAddButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="size-[7.7rem] rounded-[4px] border-[3px] border-solid border-neutral-900/25 bg-white/50 text-neutral-700 hover:bg-white/80 hover:border-neutral-900/40 transition-colors duration-150 grid place-items-center"
    >
      <Plus size={78} strokeWidth={1.5} className="opacity-50" />
    </button>
  );
}
