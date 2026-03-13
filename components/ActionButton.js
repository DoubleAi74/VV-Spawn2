'use client';

export default function ActionButton({
  onClick,
  children,
  active = false,
  disabled = false,
  title,
  className = '',
  type = 'button',
}) {
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className={`
        flex items-center gap-2
        h-[40px] px-4
        rounded-sm
        text-sm
        border border-white/10
        transition-colors duration-100
        ${
          disabled
            ? 'bg-black/20 text-zinc-500 cursor-not-allowed opacity-60'
            : active
              ? 'bg-black/70 text-white'
              : 'bg-black/40 text-zinc-300 hover:bg-black/60 hover:text-white backdrop-blur-[2px]'
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
}
