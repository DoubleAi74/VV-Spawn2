"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const structuralStyles =
  "col-start-1 row-start-1 w-full px-3 py-[7px] text-base leading-relaxed font-sans rounded-[3px] break-words outline-none resize-none overflow-hidden";

const baseStyles =
  "col-start-1 row-start-1 w-full rounded-[3px] text-base leading-relaxed font-sans break-words outline-none resize-none overflow-hidden";

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

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getInfoPalette(backgroundHex) {
  const safeBack = normalizeHex(backgroundHex, "#e5e7eb");
  const isDarkBackground = getLuminance(safeBack) < 0.26;

  if (isDarkBackground) {
    const surfaceHex = mixHex(safeBack, "#ffffff", 0.16);

    return {
      panelBackground: hexToRgba(surfaceHex, 0.74),
      panelBorder: hexToRgba("#ffffff", 0.16),
      panelShadow: "0 10px 24px rgba(0, 0, 0, 0.22)",
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
    panelShadow: "0 4px 4px rgba(15, 15, 15, 0.04)",
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

export default function DashboardInfoEditor({
  initialText,
  isEditMode,
  onSave,
}) {
  const { backHex } = useTheme();
  const [value, setValue] = useState(initialText || "");
  const [serverValue, setServerValue] = useState(initialText || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const palette = useMemo(() => getInfoPalette(backHex), [backHex]);

  useEffect(() => {
    const next = initialText || "";
    setValue(next);
    setServerValue(next);
    setError("");
  }, [initialText]);

  const saveValue = useCallback(async () => {
    if (!isEditMode) return;
    if (value === serverValue) return;

    setSaving(true);
    setError("");
    try {
      await onSave(value);
      setServerValue(value);
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }, [isEditMode, onSave, value, serverValue]);

  useEffect(() => {
    if (!isEditMode) return;
    if (value === serverValue) return;
    const timer = setTimeout(() => {
      void saveValue();
    }, 1500);
    return () => clearTimeout(timer);
  }, [value, serverValue, isEditMode, saveValue]);

  const hasContent = value && value !== "<p><br></p>" && value.trim() !== "";
  const statusLabel = saving
    ? "Saving..."
    : error || (value === serverValue ? "Saved" : "Unsaved");
  const statusStyles = error
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

  return (
    <section className={`${isEditMode ? "mb-6" : "mb-5"} w-full block`}>
      <div className="relative grid grid-cols-1 w-full min-h-[40px]">
        <div
          className={`${baseStyles} px-3.5 py-[8px] border ${
            isEditMode
              ? "whitespace-pre-wrap text-transparent select-none"
              : "whitespace-normal"
          }`}
          style={{
            backgroundColor: palette.panelBackground,
            borderColor: palette.panelBorder,
            boxShadow: palette.panelShadow,
            color: isEditMode ? "transparent" : palette.textColor,
          }}
          aria-hidden={isEditMode}
        >
          {isEditMode ? (
            <>{(value || "") + "\u00A0"}</>
          ) : (
            <div
              className="dashboard-content"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(value || "\u00A0", SANITIZE_OPTIONS),
              }}
            />
          )}
        </div>

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add text or HTML"
          className={`${structuralStyles} absolute inset-0 z-10 bg-transparent border-transparent focus:ring-3 ${
            palette.textareaToneClasses
          } ${
            isEditMode
              ? "opacity-100 visible"
              : "opacity-0 invisible pointer-events-none"
          }`}
          readOnly={!isEditMode}
        />

        <div
          className={`absolute bottom-2 right-2 z-[19] pointer-events-none transition-opacity duration-200 ${
            isEditMode ? "opacity-100" : "opacity-0"
          }`}
        >
          <label
            className="text-xs font-medium px-1.5 py-0.5 rounded-[2px] shadow-sm border"
            style={statusStyles}
          >
            {statusLabel}
          </label>
        </div>
      </div>
    </section>
  );
}
