"use client";

import { useEffect, useMemo } from "react";
import { getInfoPalette } from "@/lib/colour";
import { useTheme } from "@/context/ThemeContext";
import {
  INFO_MODE_HTML,
  INFO_MODE_TEXT,
} from "@/lib/infoMode";
import { PAGE_INFO_FIELDS } from "@/lib/infoFields";
import { useInfoSync } from "@/lib/useInfoSync";
import PageInfoView, { hasVisibleInfo } from "@/components/page/PageInfoView";

function HtmlInfoEditor({
  value,
  mode,
  onChange,
  onModeChange,
  isEditing,
  placeholder,
  statusLabel,
  palette,
  hasError,
  backHex,
  initialHeight,
  onHeight,
}) {
  const structuralStyles =
    "col-start-1 row-start-1 w-full px-3 py-[7px] pr-36 text-base leading-relaxed font-sans rounded-[3px] break-words outline-none resize-none overflow-hidden";

  const baseStyles =
    "col-start-1 row-start-1 w-full rounded-[3px] text-base leading-relaxed font-sans break-words outline-none resize-none overflow-hidden";

  const isHtml = mode === INFO_MODE_HTML;

  if (!isEditing) {
    return (
      <PageInfoView
        value={value}
        mode={mode}
        backHex={backHex}
        initialHeight={initialHeight}
        onHeight={onHeight}
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
          placeholder={placeholder}
          className={`${structuralStyles} absolute inset-0 z-10 bg-transparent border-transparent focus:ring-3 ${palette.textareaToneClasses}`}
        />

        <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded-[2px] shadow-sm border pointer-events-none"
            style={
              hasError
                ? {
                    backgroundColor: palette.errorBackground,
                    borderColor: palette.errorBorder,
                    color: palette.errorText,
                  }
                : {
                    backgroundColor: palette.statusBackground,
                    borderColor: palette.statusBorder,
                    color: palette.mutedTextColor,
                  }
            }
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

export default function PageInfoEditor({
  pageId,
  initialText1,
  initialText2,
  initialMode,
  initialMode1,
  canEdit,
  isEditMode,
  onHasContentChange,
  onAboveMeta,
  initialHeight1,
  onAboveHeight,
  children,
}) {
  const { backHex } = useTheme();
  const info = useInfoSync({
    initialValues: {
      infoText1: initialText1,
      infoText2: initialText2,
      infoMode: initialMode,
      infoMode1: initialMode1,
    },
    fields: PAGE_INFO_FIELDS,
    readUrl: `/api/pages/${pageId}/meta`,
    writeUrl: `/api/pages/${pageId}/meta`,
    canEdit,
    isEditMode,
    storageKey: `volvox:infoDraft:page:${pageId}`,
  });
  const { infoText1: text1, infoText2: text2, infoMode1: mode1, infoMode: mode2 } = info.values;
  const palette = useMemo(() => getInfoPalette(backHex), [backHex]);

  const hasText1 = hasVisibleInfo(text1);
  const hasText2 = hasVisibleInfo(text2);

  useEffect(() => {
    onHasContentChange?.(hasText1 || hasText2);
  }, [hasText1, hasText2, onHasContentChange]);

  useEffect(() => {
    onAboveMeta?.({ text: text1, mode: mode1 });
  }, [text1, mode1, onAboveMeta]);

  const status1 = info.statusFor("infoText1", "infoMode1");
  const status2 = info.statusFor("infoText2", "infoMode");

  const above =
    !isEditMode && !hasText1 ? null : (
      <HtmlInfoEditor
        value={text1}
        mode={mode1}
        onChange={(text) => info.change("infoText1", text)}
        onModeChange={(mode) => info.change("infoMode1", mode)}
        isEditing={isEditMode}
        placeholder={
          mode1 === INFO_MODE_HTML ? "Paste HTML" : "Add text or HTML"
        }
        statusLabel={status1}
        palette={palette}
        hasError={Boolean(info.error)}
        backHex={backHex}
        initialHeight={initialHeight1}
        onHeight={onAboveHeight}
      />
    );

  const below =
    !isEditMode && !hasText2 ? null : (
      <HtmlInfoEditor
        value={text2}
        mode={mode2}
        onChange={(text) => info.change("infoText2", text)}
        onModeChange={(mode) => info.change("infoMode", mode)}
        isEditing={isEditMode}
        placeholder={
          mode2 === INFO_MODE_HTML ? "Paste HTML" : "Add text or HTML"
        }
        statusLabel={status2}
        palette={palette}
        hasError={Boolean(info.error)}
        backHex={backHex}
      />
    );

  if (typeof children === "function") {
    return children({ above, below });
  }

  return below;
}
