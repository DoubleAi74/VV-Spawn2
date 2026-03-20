"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import sanitizeHtml from "sanitize-html";
import { useTheme } from "@/context/ThemeContext";

const SANITIZE_OPTIONS = {
  allowedTags: [
    "b",
    "i",
    "em",
    "strong",
    "a",
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "blockquote",
    "code",
    "pre",
  ],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
};

function normalizeHex(hex, fallback = "#e5e7eb") {
  const value = String(hex || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return fallback;
}

function hexToRgb(hex) {
  const safeHex = normalizeHex(hex).replace("#", "");
  return {
    r: parseInt(safeHex.slice(0, 2), 16),
    g: parseInt(safeHex.slice(2, 4), 16),
    b: parseInt(safeHex.slice(4, 6), 16),
  };
}

function hexToRgba(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHex(baseHex, mixWithHex, weight = 0.5) {
  const base = hexToRgb(baseHex);
  const mix = hexToRgb(mixWithHex);
  const mixChannel = (start, end) =>
    Math.round(start + (end - start) * Math.max(0, Math.min(1, weight)));
  const toHex = (value) => value.toString(16).padStart(2, "0");

  return `#${toHex(mixChannel(base.r, mix.r))}${toHex(
    mixChannel(base.g, mix.g),
  )}${toHex(mixChannel(base.b, mix.b))}`;
}

function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  );
}

function getInfoPalette(backgroundHex) {
  const safeBack = normalizeHex(backgroundHex, "#e5e7eb");
  const isDarkBackground = getLuminance(safeBack) < 0.26;

  if (isDarkBackground) {
    const surfaceHex = mixHex(safeBack, "#ffffff", 0.16);

    return {
      panelBackground: hexToRgba(surfaceHex, 0.74),
      panelBorder: hexToRgba("#ffffff", 0.16),
      panelShadow: "0 12px 28px rgba(0, 0, 0, 0.22)",
      textColor: "rgba(248, 250, 252, 0.94)",
      mutedTextColor: "rgba(226, 232, 240, 0.76)",
      textareaToneClasses:
        "text-white placeholder:text-white/35 caret-white focus:ring-white/15",
      statusBackground: hexToRgba("#ffffff", 0.08),
      statusBorder: hexToRgba("#ffffff", 0.12),
      errorBackground: "rgba(127, 29, 29, 0.32)",
      errorBorder: "rgba(248, 113, 113, 0.24)",
      errorText: "rgba(254, 226, 226, 0.94)",
    };
  }

  return {
    panelBackground: "rgba(255, 255, 255, 0.52)",
    panelBorder: "rgba(163, 163, 163, 0.38)",
    panelShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
    textColor: "rgba(23, 23, 23, 0.92)",
    mutedTextColor: "rgba(82, 82, 91, 0.76)",
    textareaToneClasses:
      "text-neutral-900 placeholder:text-neutral-500/70 caret-neutral-900 focus:ring-neutral-400/20",
    statusBackground: "rgba(255, 255, 255, 0.58)",
    statusBorder: "rgba(255, 255, 255, 0.62)",
    errorBackground: "rgba(254, 226, 226, 0.78)",
    errorBorder: "rgba(248, 113, 113, 0.22)",
    errorText: "rgba(153, 27, 27, 0.9)",
  };
}

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
                __html: sanitizeHtml(value || "\u00A0", SANITIZE_OPTIONS),
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
