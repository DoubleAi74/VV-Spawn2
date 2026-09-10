import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { POST_GRID_MAX, POST_GRID_MIN } from "@/lib/postGrid";

/**
 * The header up/down pair that sets how many cards the grid shows per row.
 * `noun` names what the grid is showing ("Posts" on a page, "Pages" on the
 * dashboard) for the accessible labels.
 */
export default function PostColsStepper({
  postCols, onAdjust, noun = "Posts", maxCols = POST_GRID_MAX,
  onReset, resetLabel = 'Use automatic layout', statusText = '',
}) {
  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label={`${noun} per row`}
    >
      <div className="flex flex-col overflow-hidden rounded-none border border-white/20 bg-white/10">
        <button
          type="button"
          onClick={() => onAdjust(1)}
          disabled={postCols >= maxCols}
          className="h-5 w-9 grid place-items-center text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
          aria-label={`More ${noun.toLowerCase()} per row`}
          title={`More ${noun.toLowerCase()} per row`}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          onClick={() => onAdjust(-1)}
          disabled={postCols === POST_GRID_MIN}
          className="h-5 w-9 grid place-items-center border-t border-white/20 text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
          aria-label={`Fewer ${noun.toLowerCase()} per row`}
          title={`Fewer ${noun.toLowerCase()} per row`}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          aria-label={resetLabel}
          title={resetLabel}
          className="h-8 w-6 grid place-items-center text-white/65 hover:text-white transition-colors"
        >
          <RotateCcw size={13} />
        </button>
      )}
      <span role="status" className="sr-only">{statusText}</span>
    </div>
  );
}
