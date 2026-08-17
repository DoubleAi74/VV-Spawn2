"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Edit2, Eye } from "lucide-react";
import { signOut } from "next-auth/react";
import TitleEdit, { TitleEditPanel } from "@/components/dashboard/TitleEdit";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { focusRingOn, lighten, readableInkOn } from "@/lib/colour";

// Long enough that a continuous drag of the native picker never reaches it —
// the write happens when the drag stops, or immediately on `change` when the
// picker is dismissed. It used to be 280ms, which meant a stream of PATCHes,
// each one running updateUserColours and then revalidating every page the user
// owns.
const COLOUR_COMMIT_DELAY = 800;

/**
 * A native colour input fires `input` continuously while the picker is dragged
 * and `change` once when it is committed. React's onChange is the former, so
 * the commit is subscribed to directly.
 */
function ColourInput({ value, onInput, onCommit, className, label }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const handleCommit = () => onCommit();
    el.addEventListener("change", handleCommit);
    return () => el.removeEventListener("change", handleCommit);
  }, [onCommit]);

  return (
    <input
      ref={ref}
      type="color"
      className={className}
      value={value}
      onChange={(e) => onInput(e.target.value)}
      aria-label={label}
    />
  );
}

export default function DashHeader({
  usernameTitle,
  usernameTag,
  email,
  isOwner,
  isEditMode,
  statusText,
  onToggleEdit,
  onTitleSave,
}) {
  const { dashHex, backHex, setDashHex, setBackHex } = useTheme();
  const { showError } = useToast();
  const persistTimerRef = useRef(null);
  const pendingColoursRef = useRef(null);
  const [titleEditing, setTitleEditing] = useState(false);

  const persist = useCallback(
    async ({ dashHex: nextDash, backHex: nextBack }) => {
      try {
        const res = await fetch("/api/user/colours", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dashHex: nextDash, backHex: nextBack }),
        });
        // This was a bare `await fetch(...)` with no status check and no error
        // path — the last mutation in the app that could fail in silence.
        if (!res.ok) throw new Error(`Colour save failed: ${res.status}`);
      } catch {
        showError(
          "Couldn't save your colours",
          "They still look right here, but the change was not saved. Try again.",
        );
      }
    },
    [showError],
  );

  const flushColours = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const pending = pendingColoursRef.current;
    if (!pending) return;
    pendingColoursRef.current = null;
    void persist(pending);
  }, [persist]);

  // A pending change must not be lost by navigating away mid-drag.
  useEffect(() => () => flushColours(), [flushColours]);

  const queuePersist = useCallback(
    (nextDash, nextBack) => {
      pendingColoursRef.current = { dashHex: nextDash, backHex: nextBack };
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(flushColours, COLOUR_COMMIT_DELAY);
    },
    [flushColours],
  );

  function handleDashChange(next) {
    setDashHex(next);
    queuePersist(next, backHex);
  }

  function handleBackChange(next) {
    setBackHex(next);
    queuePersist(dashHex, next);
  }

  return (
    <div className="relative">
    <header
      className="left-0 right-0 z-40 border-b border-black/10 backdrop-blur-md shadow-sm"
      style={{
        backgroundColor: dashHex,
        paddingTop: "env(safe-area-inset-top, 0px)",
        // Controls in here sit on dashHex, not on the page background, so the
        // header carries its own ring colour. See LNK-4.
        "--focus-ring": focusRingOn(dashHex),
      }}
    >
      <div className="w-full px-4 sm:px-8">
        <div className="flex items-center justify-between gap-2 min-h-[73px] sm:min-h-[85px]">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <TitleEdit
              currentTitle={usernameTitle}
              isEditMode={isEditMode}
              editing={titleEditing}
              onEditingChange={setTitleEditing}
              // lighten(dashHex, 245) clamped to near-white on any pale
              // header and the user's own name disappeared. See LNK-4.
              textColor={readableInkOn(dashHex)}
            />

            {isOwner && isEditMode && (
              <div className="hidden sm:flex shrink-0 pt-[10px] pb-[6px] px-1 sm:px-3 gap-2">
                <ColourInput
                  className="h-8 w-9 cursor-pointer rounded-[3px] border border-white/50 bg-white/10 px-[2px] shadow"
                  value={backHex}
                  onInput={handleBackChange}
                  onCommit={flushColours}
                  label="Background colour"
                />
                <ColourInput
                  className="h-8 w-9 cursor-pointer rounded-[3px] border border-white/50 bg-white/10 px-[2px] shadow"
                  value={dashHex}
                  onInput={handleDashChange}
                  onCommit={flushColours}
                  label="Header colour"
                />
              </div>
            )}
          </div>

          <nav
            className="flex items-center gap-2 shrink-0 translate-y-[1px] sm:translate-y-0"
            aria-label="Dashboard actions"
          >
            {isOwner ? (
              <>
                {statusText ? (
                  <span className="text-white/60 text-xs hidden sm:block">
                    {statusText}
                  </span>
                ) : null}
                <span className="text-white/70 text-xs hidden md:block truncate max-w-[160px]">
                  {email}
                </span>
                {isEditMode && (
                  <div className="flex sm:hidden gap-2">
                    <ColourInput
                      className="h-8 w-8 cursor-pointer rounded-[3px] border border-white/50 bg-white/10 px-[2px] shadow"
                      value={backHex}
                      onInput={handleBackChange}
                      onCommit={flushColours}
                      label="Background colour"
                    />
                    <ColourInput
                      className="h-8 w-8 cursor-pointer rounded-[3px] border border-white/50 bg-white/10 px-[2px] shadow"
                      value={dashHex}
                      onInput={handleDashChange}
                      onCommit={flushColours}
                      label="Header colour"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={onToggleEdit}
                  className={`rounded-[3px] border font-medium transition-all
                    h-8 w-8 sm:h-9 sm:w-[67px] sm:text-sm ${
                      isEditMode
                        ? "bg-white/20 text-white/90 border-white/30 hover:bg-white/25 hover:text-white"
                        : "bg-white/10 text-white/80 border-white/20 hover:bg-white/15 hover:text-white"
                    }`}
                  aria-pressed={isEditMode}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {isEditMode ? <Eye size={14} /> : <Edit2 size={14} />}
                    <span className="hidden sm:inline">
                      {isEditMode ? "View" : "Edit"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="h-8 w-8 sm:h-9 sm:w-9 grid place-items-center rounded-[3px] border border-white/20 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white transition-all"
                  aria-label="Sign out"
                >
                  <LogOut size={15} />
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="h-8 px-2.5 sm:h-9 sm:px-3 rounded-[3px] border border-white/20 bg-white/10 text-xs sm:text-sm text-white/85 hover:bg-white/15 transition-all inline-flex items-center"
              >
                Login
              </Link>
            )}
          </nav>
        </div>
      </div>
      <div className="w-full pb-[5px]" style={{ backgroundColor: dashHex }}>
        <div
          className="h-[8px] w-full border-t border-black/15"
          style={{ backgroundColor: lighten(dashHex, 30) }}
        />
      </div>
    </header>

    {titleEditing && isEditMode && (
      <TitleEditPanel
        currentTitle={usernameTitle}
        currentTag={usernameTag}
        onSave={(newTag, newTitle) => {
          setTitleEditing(false);
          onTitleSave?.(newTag, newTitle);
        }}
        onClose={() => setTitleEditing(false)}
      />
    )}
    </div>
  );
}
