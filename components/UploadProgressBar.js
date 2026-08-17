"use client";

/**
 * A determinate upload bar. `value` is 0–1, or null when nothing is uploading.
 *
 * Deliberately determinate: the point of UPL-1 is that a 40 KB thumbnail and a
 * 100 MB file stop looking identical.
 */
export default function UploadProgressBar({ value, label = "Uploading" }) {
  if (value === null || value === undefined) return null;

  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);

  return (
    <div className="mt-2">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-emerald-400/70 transition-[width] duration-150 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-white/40">
        {label} — {percent}%
      </p>
    </div>
  );
}
