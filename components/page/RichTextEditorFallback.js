export const RICH_TEXT_EDITOR_FRAME_HEIGHT_CLASS = 'min-h-[124px]';

export default function RichTextEditorFallback() {
  return (
    <div
      className={`overflow-hidden rounded-[3px] border border-white/10 bg-white/5 ${RICH_TEXT_EDITOR_FRAME_HEIGHT_CLASS}`}
    >
      <div className="flex h-[41px] items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3">
        <div className="h-2.5 w-12 rounded-full bg-white/15" />
        <div className="h-5 w-px bg-white/10" />
        <div className="h-5 w-5 rounded-[2px] bg-white/10" />
        <div className="h-5 w-5 rounded-[2px] bg-white/10" />
        <div className="h-5 w-5 rounded-[2px] bg-white/10" />
      </div>
      <div className="min-h-[81px] bg-white/[0.02] px-4 py-3">
        <div className="h-3 w-36 rounded-full bg-white/10" />
      </div>
    </div>
  );
}
