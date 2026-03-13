"use client";

import { useEffect, useState, useCallback } from "react";
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

function HtmlInfoEditor({
  value,
  onChange,
  isEditing,
  placeholder,
  statusLabel,
}) {
  const structuralStyles =
    "col-start-1 row-start-1 w-full px-3 py-[7px] text-base leading-relaxed font-sans rounded-[3px] break-words outline-none resize-none overflow-hidden";

  const baseStyles =
    "col-start-1 row-start-1 w-full rounded-[3px] text-base leading-relaxed font-sans break-words outline-none resize-none overflow-hidden";

  return (
    <section className="w-full block">
      <div className="relative grid grid-cols-1 w-full min-h-[40px]">
        <div
          className={`${baseStyles} ${
            isEditing
              ? "px-3.5 py-[8px] whitespace-pre-wrap bg-white/50 border border-neutral-300/45 text-transparent select-none"
              : "px-3.5 py-[8px] whitespace-normal bg-neutral-100/50 border border-neutral-300/35 text-neutral-900"
          }`}
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
          className={`${structuralStyles} absolute inset-0 z-10 bg-transparent border-transparent text-neutral-900 focus:ring-3 focus:ring-neutral-400/20 ${
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
          <label className="text-xs text-neutral-500/60 font-medium bg-white/50 px-1.5 py-0.5 rounded-[2px] shadow-sm border border-neutral-100/50">
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
  const [text1, setText1] = useState(initialText1 || "");
  const [text2, setText2] = useState(initialText2 || "");
  const [serverText1, setServerText1] = useState(initialText1 || "");
  const [serverText2, setServerText2] = useState(initialText2 || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      />
    </div>
  );
}
