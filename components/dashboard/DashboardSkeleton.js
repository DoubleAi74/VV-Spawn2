"use client";

/**
 * Dashboard loading UI. Used only as the Suspense fallback inside the
 * dashboard page — not as `loading.js`, which would also wrap child routes
 * and flash this skeleton when opening a page.
 */

import { useParams } from "next/navigation";
import PageCardSurface from "@/components/dashboard/PageCardSurface";
import { postGridClassFor } from "@/lib/postGrid";
import {
  getDashboardSnapshot,
  setDashboardSnapshot,
} from "@/lib/routeTransitionCache";
import { useDashboardSnapshot } from "@/lib/useRouteSnapshot";
import { normalizeHex, lighten, readableInkOn, focusRingOn } from "@/lib/colour";
import { readPersistedTheme } from "@/context/ThemeContext";
import { useProfileShell } from "@/context/ProfileShellContext";
import DashboardContent from "@/components/dashboard/DashboardContent";
import LoadingOwnerChrome from "@/components/LoadingOwnerChrome";
import PageInfoView, { hasVisibleInfo } from "@/components/page/PageInfoView";

// What the local copy of lighten() fell back to before FND-2.
const LOADING_FALLBACK_HEX = "#2d3e50";

export default function DashboardSkeleton() {
  const params = useParams();
  const usernameTag =
    typeof params?.usernameTag === "string" ? params.usernameTag : "";
  const snapshot = useDashboardSnapshot(usernameTag);
  const shell = useProfileShell(usernameTag);
  const persisted = readPersistedTheme(usernameTag);

  const hasSnapshotCards =
    Array.isArray(snapshot?.pages) && snapshot.pages.length > 0;

  const dashHex = normalizeHex(
    snapshot?.dashHex || shell?.dashHex || persisted?.dashHex,
    "#3b3b3b",
  );
  const backHex = normalizeHex(
    snapshot?.backHex || shell?.backHex || persisted?.backHex,
    "#cccccc",
  );
  const pages = hasSnapshotCards ? snapshot.pages : [];
  const usernameTitle = snapshot?.usernameTitle || shell?.usernameTitle;

  // Mirror DashboardViewClient's grid so the cards do not jump when the
  // flight finishes.
  const postGridClass = postGridClassFor(snapshot?.gridCols);

  return (
    <div
      className="dashboard-shell overscroll-none flex flex-col"
      style={{ backgroundColor: backHex }}
    >
      {/* Match the live sticky wrapper and title slot through the handoff. */}
      <div
        className="dashboard-sticky-chrome"
        style={{ backgroundColor: backHex }}
      >
        <div className="relative">
          <header
            className="left-0 right-0 z-40 border-b border-black/10 shadow-sm"
            style={{
              backgroundColor: dashHex,
              paddingTop: "env(safe-area-inset-top, 0px)",
              "--focus-ring": focusRingOn(dashHex),
            }}
          >
            <div className="w-full px-4 sm:px-8">
              <div className="flex items-center justify-between gap-2 min-h-[73px] sm:min-h-[85px] py-2 sm:py-0">
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                  {usernameTitle ? (
                    <h1
                      className="min-w-0 text-[22px] sm:text-4xl font-extrabold tracking-tight drop-shadow sm:pr-2 leading-tight break-words sm:truncate"
                      style={{ color: readableInkOn(dashHex) }}
                    >
                      {usernameTitle}
                    </h1>
                  ) : (
                    <div className="h-7 sm:h-10 w-48 sm:w-64 rounded-[3px] bg-white/20 animate-pulse" />
                  )}
                </div>
                <LoadingOwnerChrome
                  isOwner={snapshot?.isOwner}
                  email={
                    snapshot?.isOwner === false ? "" : snapshot?.email || ""
                  }
                />
              </div>
            </div>
            <div className="w-full pb-[5px]" style={{ backgroundColor: dashHex }}>
              <div
                className="h-[8px] w-full border-t border-black/15"
                style={{ backgroundColor: lighten(dashHex, 30, LOADING_FALLBACK_HEX) }}
              />
            </div>
          </header>
        </div>
      </div>

      <DashboardContent
        backHex={backHex}
        loading={!hasSnapshotCards}
        className={`w-full flex flex-col px-[10px] md:px-8 pb-72 ${
          pages.length > 0 && hasVisibleInfo(snapshot?.infoText1)
            ? "pt-[1.8rem]"
            : "pt-[calc(1.8rem*1.53)]"
        }`}
      >
        {pages.length > 0 && hasVisibleInfo(snapshot?.infoText1) ? (
          <div className="mb-6 shrink-0">
            <PageInfoView
              value={snapshot.infoText1}
              mode={snapshot.infoMode1}
              backHex={backHex}
              title="Dashboard info"
              initialHeight={snapshot.infoHeight1}
              className="w-full block"
              contentClassName="dashboard-content"
              onHeight={(height) => {
                const current = getDashboardSnapshot(usernameTag);
                if (!current || current.infoHeight1 === height) return;
                setDashboardSnapshot(usernameTag, {
                  ...current,
                  infoHeight1: height,
                });
              }}
            />
          </div>
        ) : null}
        {pages.length > 0 ? (
          <div className={`grid ${postGridClass} gap-[7px] sm:gap-4`}>
            {pages.map((page, index) => (
              <PageCardSurface
                key={page._id || `skeleton-${index}`}
                page={page}
                isOwner={snapshot?.isOwner}
                priority={index < 4}
                aria-busy="true"
              />
            ))}
          </div>
        ) : null}
        {pages.length > 0 && hasVisibleInfo(snapshot?.infoText) ? (
          <div className="mt-6 shrink-0">
            <PageInfoView
              value={snapshot.infoText}
              mode={snapshot.infoMode}
              backHex={backHex}
              title="Dashboard info"
              initialHeight={snapshot.infoHeight}
              className="w-full block"
              contentClassName="dashboard-content"
              onHeight={(height) => {
                const current = getDashboardSnapshot(usernameTag);
                if (!current || current.infoHeight === height) return;
                setDashboardSnapshot(usernameTag, {
                  ...current,
                  infoHeight: height,
                });
              }}
            />
          </div>
        ) : null}
      </DashboardContent>
    </div>
  );
}
