"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { getInfoPalette } from "@/lib/colour";
import { useTheme } from "@/context/ThemeContext";
import {
  INFO_MODE_HTML,
  INFO_MODE_TEXT,
  normalizeInfoMode,
} from "@/lib/infoMode";
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
  isEditMode,
  onHasContentChange,
  onAboveMeta,
  initialHeight1,
  onAboveHeight,
  children,
}) {
  const { backHex } = useTheme();
  const [text1, setText1] = useState(initialText1 || "");
  const [text2, setText2] = useState(initialText2 || "");
  const [mode1, setMode1] = useState(() =>
    normalizeInfoMode(initialMode1, initialText1 || ""),
  );
  const [mode2, setMode2] = useState(() =>
    normalizeInfoMode(initialMode, initialText2 || ""),
  );
  const [serverText1, setServerText1] = useState(initialText1 || "");
  const [serverText2, setServerText2] = useState(initialText2 || "");
  const [serverMode1, setServerMode1] = useState(() =>
    normalizeInfoMode(initialMode1, initialText1 || ""),
  );
  const [serverMode2, setServerMode2] = useState(() =>
    normalizeInfoMode(initialMode, initialText2 || ""),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const palette = useMemo(() => getInfoPalette(backHex), [backHex]);

  useEffect(() => {
    const next1 = initialText1 || "";
    const next2 = initialText2 || "";
    const nextMode1 = normalizeInfoMode(initialMode1, next1);
    const nextMode2 = normalizeInfoMode(initialMode, next2);
    setText1(next1);
    setText2(next2);
    setMode1(nextMode1);
    setMode2(nextMode2);
    setServerText1(next1);
    setServerText2(next2);
    setServerMode1(nextMode1);
    setServerMode2(nextMode2);
    setError("");
  }, [pageId, initialText1, initialText2, initialMode, initialMode1]);

  const saveInfo = useCallback(async () => {
    if (!pageId) return;
    if (
      text1 === serverText1 &&
      text2 === serverText2 &&
      mode1 === serverMode1 &&
      mode2 === serverMode2
    ) {
      return;
    }

    const sent1 = text1;
    const sent2 = text2;
    const sentMode1 = mode1;
    const sentMode2 = mode2;
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/pages/${pageId}/meta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          infoText1: sent1,
          infoText2: sent2,
          infoMode: sentMode2,
          infoMode1: sentMode1,
        }),
      });

      if (!res.ok) {
        throw new Error("save failed");
      }

      const stored = await res.json().catch(() => ({}));
      const clean1 =
        typeof stored.infoText1 === "string" ? stored.infoText1 : sent1;
      const clean2 =
        typeof stored.infoText2 === "string" ? stored.infoText2 : sent2;
      const cleanMode1 = normalizeInfoMode(stored.infoMode1, clean1);
      const cleanMode2 = normalizeInfoMode(stored.infoMode, clean2);
      setServerText1(clean1);
      setServerText2(clean2);
      setServerMode1(cleanMode1);
      setServerMode2(cleanMode2);
      setText1((current) => (current === sent1 ? clean1 : current));
      setText2((current) => (current === sent2 ? clean2 : current));
      setMode1((current) => (current === sentMode1 ? cleanMode1 : current));
      setMode2((current) => (current === sentMode2 ? cleanMode2 : current));
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }, [
    pageId,
    text1,
    text2,
    mode1,
    mode2,
    serverText1,
    serverText2,
    serverMode1,
    serverMode2,
  ]);

  useEffect(() => {
    if (!pageId) return;
    if (
      text1 === serverText1 &&
      text2 === serverText2 &&
      mode1 === serverMode1 &&
      mode2 === serverMode2
    ) {
      return;
    }

    const timer = setTimeout(() => {
      void saveInfo();
    }, 1500);

    return () => clearTimeout(timer);
  }, [
    text1,
    text2,
    mode1,
    mode2,
    pageId,
    serverText1,
    serverText2,
    serverMode1,
    serverMode2,
    saveInfo,
  ]);

  const saveInfoRef = useRef(saveInfo);
  saveInfoRef.current = saveInfo;
  const wasEditModeRef = useRef(isEditMode);
  useEffect(() => {
    if (wasEditModeRef.current && !isEditMode) {
      void saveInfoRef.current();
    }
    wasEditModeRef.current = isEditMode;
  }, [isEditMode]);

  const hasText1 = hasVisibleInfo(text1);
  const hasText2 = hasVisibleInfo(text2);

  useEffect(() => {
    onHasContentChange?.(hasText1 || hasText2);
  }, [hasText1, hasText2, onHasContentChange]);

  useEffect(() => {
    onAboveMeta?.({ text: text1, mode: mode1 });
  }, [text1, mode1, onAboveMeta]);

  const savingLabel = saving ? "Saving..." : error || null;
  const status1 =
    savingLabel ||
    (text1 === serverText1 && mode1 === serverMode1 ? "Saved" : "Unsaved");
  const status2 =
    savingLabel ||
    (text2 === serverText2 && mode2 === serverMode2 ? "Saved" : "Unsaved");

  const above =
    !isEditMode && !hasText1 ? null : (
      <HtmlInfoEditor
        value={text1}
        mode={mode1}
        onChange={setText1}
        onModeChange={setMode1}
        isEditing={isEditMode}
        placeholder={
          mode1 === INFO_MODE_HTML ? "Paste HTML" : "Add text or HTML"
        }
        statusLabel={status1}
        palette={palette}
        hasError={Boolean(error)}
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
        onChange={setText2}
        onModeChange={setMode2}
        isEditing={isEditMode}
        placeholder={
          mode2 === INFO_MODE_HTML ? "Paste HTML" : "Add text or HTML"
        }
        statusLabel={status2}
        palette={palette}
        hasError={Boolean(error)}
        backHex={backHex}
      />
    );

  if (typeof children === "function") {
    return children({ above, below });
  }

  return below;
}
