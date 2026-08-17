"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getInfoPalette } from "@/lib/colour";
import { useTheme } from "@/context/ThemeContext";

const structuralStyles =
  "col-start-1 row-start-1 w-full px-3 py-[7px] text-base leading-relaxed font-sans rounded-[3px] break-words outline-none resize-none overflow-hidden";

const baseStyles =
  "col-start-1 row-start-1 w-full rounded-[3px] text-base leading-relaxed font-sans break-words outline-none resize-none overflow-hidden";

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
    const sent = value;
    try {
      const stored = await onSave(sent);
      // Adopt exactly what the server stored, so the preview cannot drift from
      // it — but only if nothing has been typed since the request went out.
      const clean = typeof stored === "string" ? stored : sent;
      setServerValue(clean);
      setValue((current) => (current === sent ? clean : current));
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
                // Already sanitised: on the way in by the route, and on the way
                // out by toPublicUser. Re-checking it here meant shipping
                // sanitize-html to every visitor of every page.
                __html: value || "\u00A0",
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
