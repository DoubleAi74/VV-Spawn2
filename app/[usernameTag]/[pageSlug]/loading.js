"use client";

import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import PostCardSurface from "@/components/page/PostCardSurface";
import {
  getPageSnapshot,
  setPageSnapshot,
} from "@/lib/routeTransitionCache";
import { usePageSnapshot } from "@/lib/useRouteSnapshot";
import {
  normalizeHex,
  lighten,
  hexToRgba,
  readableInkOn,
  focusRingOn,
  cssThemeFill,
  THEME_DASH_CSS,
  THEME_BACK_CSS,
} from "@/lib/colour";
import { readPersistedTheme } from "@/context/ThemeContext";
import { useProfileShell } from "@/context/ProfileShellContext";
import LoadingOwnerChrome from "@/components/LoadingOwnerChrome";
import PageInfoView, { hasVisibleInfo } from "@/components/page/PageInfoView";
import { postGridClassFor } from "@/lib/postGrid";

// What the local copies fell back to before FND-2.
const LOADING_FALLBACK_HEX = "#2d3e50";
const LOADING_RGBA_FALLBACK_HEX = "#e5e7eb";

export default function PageViewLoading() {
  const params = useParams();
  const usernameTag =
    typeof params?.usernameTag === "string" ? params.usernameTag : "";
  const pageSlug = typeof params?.pageSlug === "string" ? params.pageSlug : "";
  const snapshot = usePageSnapshot(usernameTag, pageSlug);
  const shell = useProfileShell(usernameTag);
  const persisted = readPersistedTheme(usernameTag);

  // Card navigation writes the live theme into the snapshot before the flight.
  // Document loads already have public branding from the profile layout; use
  // it before hydration as well, without changing viewport scrolling to load.
  const knownDash = normalizeHex(
    snapshot?.dashHex || shell?.dashHex || persisted?.dashHex,
    "",
  );
  const knownBack = normalizeHex(
    snapshot?.backHex || shell?.backHex || persisted?.backHex,
    "",
  );
  const dashHex = cssThemeFill(knownDash, THEME_DASH_CSS);
  const backHex = cssThemeFill(knownBack, THEME_BACK_CSS);
  const dashMath = knownDash || LOADING_FALLBACK_HEX;
  const backMath = knownBack || LOADING_RGBA_FALLBACK_HEX;
  const posts = snapshot?.posts?.length ? snapshot.posts : [];
  const postGridClass = postGridClassFor(snapshot?.gridCols);

  return (
    <div
      className="min-h-screen w-full p-0 md:px-6 overscroll-none flex flex-col"
      style={{
        backgroundColor: knownBack
          ? hexToRgba(backMath, 0.5, LOADING_RGBA_FALLBACK_HEX)
          : backHex,
      }}
    >
      <header
        className="sticky top-0 left-0 right-0 z-40 shadow-md"
        style={{
          backgroundColor: dashHex,
          width: "100%",
          paddingTop: "env(safe-area-inset-top, 0px)",
          marginTop: "-4px",
          paddingBottom: "4px",
          "--focus-ring": focusRingOn(dashMath),
        }}
      >
        <div className="flex items-center justify-between min-h-[52px] sm:min-h-[64px] px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 grid place-items-center rounded-[3px] border border-white/20 bg-white/10 text-white/80" aria-hidden="true">
              <ArrowLeft size={16} />
            </div>
            {snapshot?.pageTitle ? (
              <h1
                className="text-xl sm:text-2xl font-bold tracking-wide truncate"
                style={{ color: readableInkOn(dashMath) }}
              >
                {snapshot.pageTitle}
              </h1>
            ) : (
              <div className="h-6 w-44 sm:w-60 rounded-[3px] bg-white/20 animate-pulse" />
            )}
          </div>
          <LoadingOwnerChrome
            variant="page"
            email={
              snapshot?.isOwner === false ? "" : snapshot?.userEmail || ""
            }
          />
        </div>
        <div className="w-full pb-[2px]" style={{ backgroundColor: dashHex }}>
          <div
            className="h-[8px] w-full border-t border-black/15"
            style={{ backgroundColor: lighten(dashMath, 30, LOADING_FALLBACK_HEX) }}
          />
        </div>
      </header>

      {/* Clip the upward-offset watermark at the body edge, below the header. */}
      <main
        className={`relative w-full flex-1 flex flex-col overflow-hidden px-2 sm:px-4 md:px-5 pb-72 ${
          posts.length > 0 && hasVisibleInfo(snapshot?.infoText1)
            ? "pt-[33px]"
            : "pt-[calc(33px*1.5)]"
        }`}
        style={{
          backgroundColor: knownBack
            ? hexToRgba(backMath, 1, LOADING_RGBA_FALLBACK_HEX)
            : backHex,
        }}
      >
        <div className="max-w-7xl mx-auto w-full">
          {posts.length > 0 && hasVisibleInfo(snapshot?.infoText1) ? (
            <div className="mb-6 shrink-0">
              <PageInfoView
                value={snapshot.infoText1}
                mode={snapshot.infoMode1}
                backHex={backMath}
                initialHeight={snapshot.infoHeight1}
                onHeight={(height) => {
                  const current = getPageSnapshot(usernameTag, pageSlug);
                  if (!current || current.infoHeight1 === height) return;
                  setPageSnapshot(usernameTag, pageSlug, {
                    ...current,
                    infoHeight1: height,
                  });
                }}
              />
            </div>
          ) : null}
          {posts.length > 0 ? (
            <div className={`grid ${postGridClass} gap-[7px] sm:gap-4`}>
              {posts.map((post, index) => (
                <PostCardSurface
                  key={post._id || `skeleton-${index}`}
                  post={post}
                  priority={index < 4}
                  aria-busy="true"
                />
              ))}
            </div>
          ) : (
            <div className="page-loading-watermark" aria-hidden="true" />
          )}
        </div>
      </main>
    </div>
  );
}
