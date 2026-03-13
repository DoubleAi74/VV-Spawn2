"use client";

import { useCallback, useEffect, useState } from "react";
import sanitizeHtml from "sanitize-html";

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

export default function DashboardInfoEditor({
  initialText,
  isEditMode,
  onSave,
}) {
  const [value, setValue] = useState(initialText || "");
  const [serverValue, setServerValue] = useState(initialText || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  if (!isEditMode && !hasContent) return null;

  return (
    <section className={`${isEditMode ? "mb-6" : "mb-5"} w-full block`}>
      <div className="relative grid grid-cols-1 w-full min-h-[40px]">
        <div
          className={`${baseStyles} ${
            isEditMode
              ? "px-3.5 py-[8px] whitespace-pre-wrap bg-white/50 border border-neutral-300/45 text-transparent select-none"
              : "px-3.5 py-[8px] whitespace-normal bg-neutral-100/50 border border-neutral-300/35 text-neutral-900"
          }`}
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
          className={`${structuralStyles} absolute inset-0 z-10 bg-transparent border-transparent text-neutral-900 focus:ring-3 focus:ring-neutral-400/20 ${
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
          <label className="text-xs text-neutral-500/60 font-medium bg-white/50 px-1.5 py-0.5 rounded-[2px] shadow-sm border border-neutral-100/50">
            {statusLabel}
          </label>
        </div>
      </div>
    </section>
  );
}
