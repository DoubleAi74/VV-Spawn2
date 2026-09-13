"use client";

import { useMemo } from "react";
import { getInfoPalette } from "@/lib/colour";
import { useTheme } from "@/context/ThemeContext";
import { INFO_MODE_HTML, INFO_MODE_TEXT } from "@/lib/infoMode";
import PageInfoView from "@/components/page/PageInfoView";

const structuralStyles =
  "col-start-1 row-start-1 w-full px-3 py-[7px] pr-36 text-base leading-relaxed font-sans rounded-[3px] break-words outline-none resize-none overflow-hidden";

const baseStyles =
  "col-start-1 row-start-1 w-full rounded-[3px] text-base leading-relaxed font-sans break-words outline-none resize-none overflow-hidden";

export default function DashboardInfoEditor({
  value,
  mode,
  isEditMode,
  onChange,
  onModeChange,
  statusLabel,
  hasError,
  initialHeight,
  onHeight,
  slot,
}) {
  const { backHex } = useTheme();
  const palette = useMemo(() => getInfoPalette(backHex), [backHex]);
  const isHtml = mode === INFO_MODE_HTML;

  const hasContent = value && value !== "<p><br></p>" && value.trim() !== "";
  const statusStyles = hasError
    ? {
        backgroundColor: palette.errorBackground,
        borderColor: palette.errorBorder,
        color: palette.errorText,
      }
    : {
        backgroundColor: palette.statusBackground,
        borderColor: palette.statusBorder,
        color: palette.mutedTextColor,
      };

  if (!isEditMode && !hasContent) return null;

  if (!isEditMode) {
    return (
      <PageInfoView
        value={value}
        mode={mode}
        backHex={backHex}
        title="Dashboard info"
        initialHeight={initialHeight}
        onHeight={onHeight}
        slot={slot}
        className="w-full block"
        contentClassName="dashboard-content"
      />
    );
  }

  return (
    <section className="w-full block">
      <div className="relative grid grid-cols-1 w-full min-h-[40px]">
        <div
          className={`${baseStyles} px-3.5 py-[8px] border whitespace-pre-wrap text-transparent select-none`}
          style={{
            backgroundColor: palette.panelBackground,
            borderColor: palette.panelBorder,
            boxShadow: palette.panelShadow,
          }}
          aria-hidden
        >
          {(value || "") + "\u00A0"}
        </div>

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isHtml ? "Paste HTML" : "Add text or HTML"}
          className={`${structuralStyles} absolute inset-0 z-10 bg-transparent border-transparent focus:ring-3 ${palette.textareaToneClasses}`}
        />

        <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded-[2px] shadow-sm border pointer-events-none"
            style={statusStyles}
          >
            {statusLabel}
          </span>
          <button
            type="button"
            aria-pressed={isHtml}
            onClick={() =>
              onModeChange(isHtml ? INFO_MODE_TEXT : INFO_MODE_HTML)
            }
            className={`h-6 px-2 rounded-[2px] border text-[11px] font-medium transition-colors ${
              isHtml
                ? "bg-neutral-800 text-white border-neutral-700"
                : "bg-white/80 text-neutral-600 border-black/10 hover:bg-white"
            }`}
          >
            HTML
          </button>
        </div>
      </div>
    </section>
  );
}
