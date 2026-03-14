"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { LogOut, Edit2, Eye } from "lucide-react";
import { signOut } from "next-auth/react";
import TitleEdit from "@/components/dashboard/TitleEdit";
import { useTheme } from "@/context/ThemeContext";

function normalizeHex(hex, fallback = "#000000") {
  const value = String(hex || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return fallback;
}

export function lighten(hex, amount = 30) {
  const safeHex = normalizeHex(hex);
  const clean = safeHex.replace("#", "");
  let r = parseInt(clean.substring(0, 2), 16);
  let g = parseInt(clean.substring(2, 4), 16);
  let b = parseInt(clean.substring(4, 6), 16);

  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));

  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgba(hex, alpha = 1) {
  const safeHex = normalizeHex(hex);
  const clean = safeHex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function DashHeader({
  usernameTitle,
  usernameTag,
  email,
  isOwner,
  isEditMode,
  onToggleEdit,
  onTitleSave,
}) {
  const { dashHex, backHex, setDashHex, setBackHex } = useTheme();
  const persistTimerRef = useRef(null);

  useEffect(
    () => () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    },
    [],
  );

  function queuePersist(nextDash, nextBack) {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      await fetch("/api/user/colours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashHex: nextDash, backHex: nextBack }),
      }).catch(() => {});
    }, 280);
  }

  function handleDashChange(next) {
    setDashHex(next);
    queuePersist(next, backHex);
  }

  function handleBackChange(next) {
    setBackHex(next);
    queuePersist(dashHex, next);
  }

  return (
    <header
      className="left-0 right-0 z-40 border-b border-black/10 backdrop-blur-md shadow-sm"
      style={{
        backgroundColor: dashHex,
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div className="w-full px-4 sm:px-8">
        <div className="flex items-center justify-between gap-2 min-h-[73px] sm:min-h-[126px]">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 relative">
            <TitleEdit
              currentTitle={usernameTitle}
              currentTag={usernameTag}
              isEditMode={isEditMode}
              textColor={lighten(dashHex, 245)}
              onSave={(newTag, newTitle) => {
                onTitleSave?.(newTag, newTitle);
              }}
            />

            {isOwner && isEditMode && (
              <div className="hidden sm:flex shrink-0 pt-[10px] pb-[6px] px-1 sm:px-3 gap-2">
                <input
                  type="color"
                  className="h-8 w-9 cursor-pointer rounded-[3px] border border-white/50 bg-white/10 px-[2px] shadow"
                  value={backHex}
                  onChange={(e) => handleBackChange(e.target.value)}
                  aria-label="Background colour"
                />
                <input
                  type="color"
                  className="h-8 w-9 cursor-pointer rounded-[3px] border border-white/50 bg-white/10 px-[2px] shadow"
                  value={dashHex}
                  onChange={(e) => handleDashChange(e.target.value)}
                  aria-label="Header colour"
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
                <span className="text-white/70 text-xs hidden md:block truncate max-w-[160px]">
                  {email}
                </span>
                {isEditMode && (
                  <div className="flex sm:hidden gap-2">
                    <input
                      type="color"
                      className="h-8 w-8 cursor-pointer rounded-[3px] border border-white/50 bg-white/10 px-[2px] shadow"
                      value={backHex}
                      onChange={(e) => handleBackChange(e.target.value)}
                      aria-label="Background colour"
                    />
                    <input
                      type="color"
                      className="h-8 w-8 cursor-pointer rounded-[3px] border border-white/50 bg-white/10 px-[2px] shadow"
                      value={dashHex}
                      onChange={(e) => handleDashChange(e.target.value)}
                      aria-label="Header colour"
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
                    <span className="hidden sm:inline">{isEditMode ? "View" : "Edit"}</span>
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
  );
}
