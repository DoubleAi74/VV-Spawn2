"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { sanitizeRichText } from "@/lib/sanitize";
import { getInfoPalette } from "@/lib/colour";
import { useTheme } from "@/context/ThemeContext";

function HtmlInfoEditor({
  value,
  onChange,
  isEditing,
  placeholder,
  statusLabel,
  palette,
  hasError,
}) {
  const structuralStyles =
    "col-start-1 row-start-1 w-full px-3 py-[7px] text-base leading-relaxed font-sans rounded-[3px] break-words outline-none resize-none overflow-hidden";

  const baseStyles =
    "col-start-1 row-start-1 w-full rounded-[3px] text-base leading-relaxed font-sans break-words outline-none resize-none overflow-hidden";

  return (
    <section className="w-full block">
      <div className="relative grid grid-cols-1 w-full min-h-[40px]">
        <div
          className={`${baseStyles} px-3.5 py-[8px] border ${
            isEditing
              ? "whitespace-pre-wrap text-transparent select-none"
              : "whitespace-normal"
          }`}
          style={{
            backgroundColor: palette.panelBackground,
            borderColor: palette.panelBorder,
            boxShadow: palette.panelShadow,
            color: isEditing ? "transparent" : palette.textColor,
          }}
          aria-hidden={isEditing}
        >
          {isEditing ? (
            <>{(value || "") + "\u00A0"}</>
          ) : (
            <div
              className="page-content"
              dangerouslySetInnerHTML={{
                __html: sanitizeRichText(value || "\u00A0"),
              }}
            />
          )}
        </div>

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={!isEditing}
          className={`${structuralStyles} absolute inset-0 z-10 bg-transparent border-transparent focus:ring-3 ${
            palette.textareaToneClasses
          } ${
            isEditing
              ? "opacity-100 visible"
              : "opacity-0 invisible pointer-events-none"
          }`}
        />

        <div
          className={`absolute bottom-2 right-2 z-[19] pointer-events-none transition-opacity duration-200 ${
            isEditing ? "opacity-100" : "opacity-0"
          }`}
        >
          <label
            className="text-xs font-medium px-1.5 py-0.5 rounded-[2px] shadow-sm border"
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
          </label>
        </div>
      </div>
    </section>
  );
}

export default function PageInfoEditor({
  pageId,
  initialText1,
  initialText2,
  isEditMode,
  onHasContentChange,
}) {
  const { backHex } = useTheme();
  const [text1, setText1] = useState(initialText1 || "");
  const [text2, setText2] = useState(initialText2 || "");
  const [serverText1, setServerText1] = useState(initialText1 || "");
  const [serverText2, setServerText2] = useState(initialText2 || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const palette = useMemo(() => getInfoPalette(backHex), [backHex]);

  useEffect(() => {
    const next1 = initialText1 || "";
    const next2 = initialText2 || "";
    setText1(next1);
    setText2(next2);
    setServerText1(next1);
    setServerText2(next2);
    setError("");
  }, [pageId, initialText1, initialText2]);

  const saveInfo = useCallback(async () => {
    if (!pageId || !isEditMode) return;
    if (text1 === serverText1 && text2 === serverText2) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/pages/${pageId}/meta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ infoText1: text1, infoText2: text2 }),
      });

      if (!res.ok) {
        throw new Error("save failed");
      }

      setServerText1(text1);
      setServerText2(text2);
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }, [pageId, isEditMode, text1, text2, serverText1, serverText2]);

  useEffect(() => {
    if (!pageId || !isEditMode) return;
    if (text1 === serverText1 && text2 === serverText2) return;

    const timer = setTimeout(() => {
      void saveInfo();
    }, 1500);

    return () => clearTimeout(timer);
  }, [text1, text2, pageId, isEditMode, serverText1, serverText2, saveInfo]);

  const hasText2 = text2 && text2 !== "<p><br></p>" && text2.trim() !== "";

  useEffect(() => {
    onHasContentChange?.(hasText2);
  }, [hasText2, onHasContentChange]);

  if (!isEditMode && !hasText2) return null;

  const status2 = saving
    ? "Saving..."
    : error || (text2 === serverText2 ? "Saved" : "Unsaved");

  return (
    <div className="mb-6">
      <HtmlInfoEditor
        value={text2}
        onChange={setText2}
        isEditing={isEditMode}
        placeholder="Add HTML or text below the grid"
        statusLabel={status2}
        palette={palette}
        hasError={Boolean(error)}
      />
    </div>
  );
}
