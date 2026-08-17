"use client";

/**
 * The dashboard's loading state.
 *
 * This used to be `app/[usernameTag]/loading.js`. A `loading.js` opens a
 * Suspense boundary around everything below its segment, and React flushes the
 * response shell — status line included — the moment anything inside it
 * suspends. That made `notFound()` and `permanentRedirect()` in either public
 * route unable to set a status: an unknown profile answered 200 with the
 * not-found body, and a renamed page answered 200 with the destination's body
 * at the old address. Neither is any use to a crawler or a link preview, which
 * is the whole point of LNK-1 to LNK-3.
 *
 * It is now a Suspense fallback rendered *inside* the page, below the layout
 * that decides the status. Same skeleton, same snapshot, same moment on screen.
 */

import { useEffect } from "react";
import { useParams } from "next/navigation";
import ImageWithLoader from "@/components/ImageWithLoader";
import { getDashboardSnapshot } from "@/lib/routeTransitionCache";
import { normalizeHex, lighten } from "@/lib/colour";

// What the local copy of lighten() fell back to before FND-2.
const LOADING_FALLBACK_HEX = "#2d3e50";

function DashboardLoadingCard({ page, priority = false }) {
  const title = page?.title || "";
  const thumbnail = page?.thumbnail || "";
  const blurDataURL = page?.blurDataURL || "";

  return (
    <div className="p-2 pb-[3px] rounded-[4px] border-[3px] border-neutral-800/20 bg-neutral-200/60 shadow-md h-full">
      <div
        className="w-full aspect-[4/3] mb-1 rounded-sm overflow-hidden relative"
        style={{
          backgroundImage: blurDataURL ? `url("${blurDataURL}")` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: !blurDataURL ? "#d4d4d8" : undefined,
        }}
      >
        {thumbnail ? (
          <ImageWithLoader
            src={thumbnail}
            alt={title || "Page preview"}
            blurDataURL={blurDataURL}
            fill
            priority={priority}
            className="object-cover"
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-neutral-100/10 to-transparent [animation:shimmer_1.5s_linear_infinite]" />
            <div className="absolute inset-0 bg-neutral-200/30 animate-pulse" />
          </>
        )}
      </div>
      <div className="flex pl-1 pr-1 items-center justify-between gap-1 h-8 w-full overflow-hidden">
        {title ? (
          <h3
            className="min-w-0 truncate font-bold text-neutral-800/90 text-sm"
            title={title}
          >
            {title}
          </h3>
        ) : (
          <div className="h-4 w-3/5 bg-neutral-800/10 rounded-sm" />
        )}
      </div>
    </div>
  );
}

export default function DashboardSkeleton() {
  const params = useParams();
  const usernameTag =
    typeof params?.usernameTag === "string" ? params.usernameTag : "";
  const snapshot = getDashboardSnapshot(usernameTag);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  const hasSnapshotCards =
    Array.isArray(snapshot?.pages) && snapshot.pages.length > 0;

  const dashHex = normalizeHex(snapshot?.dashHex, "#3b3b3b");
  const backHex = normalizeHex(snapshot?.backHex, "#cccccc");
  const pages = hasSnapshotCards ? snapshot.pages : [];

  return (
    <div
      className="min-h-[150vh] overscroll-none"
      style={{ backgroundColor: backHex }}
    >
      <header
        className="sticky top-0 left-0 right-0 z-40 border-b border-black/10 backdrop-blur-md shadow-sm"
        style={{
          backgroundColor: dashHex,
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <div className="w-full px-0">
          <div className="flex items-center min-h-[73px] sm:min-h-[85px] px-4 sm:px-8">
            {snapshot?.usernameTitle ? (
              <h1
                className="text-2xl sm:text-4xl font-extrabold tracking-tight truncate"
                style={{ color: lighten(dashHex, 245, LOADING_FALLBACK_HEX) }}
              >
                {snapshot.usernameTitle}
              </h1>
            ) : (
              <div className="h-7 sm:h-10 w-48 sm:w-64 rounded-[3px] bg-white/20 animate-pulse" />
            )}
          </div>
        </div>
        <div className="w-full pb-[5px]" style={{ backgroundColor: dashHex }}>
          <div
            className="h-[8px] w-full border-t border-black/15"
            style={{ backgroundColor: lighten(dashHex, 30, LOADING_FALLBACK_HEX) }}
          />
        </div>
      </header>

      <main className="w-full px-[10px] md:px-8 pt-[1.8rem] pb-72">
        {pages.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[7px] sm:gap-4">
            {pages.map((page, index) => (
              <DashboardLoadingCard
                key={page._id || `skeleton-${index}`}
                page={page}
                priority={index < 4}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center pt-[0px] mt-[-290px] pr-[30px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/vv-grey.png"
              alt=""
              className="w-[1300px] h-[1300px] max-w-none opacity-30"
              // className="w-[690px] h-[690px] opacity-20"
            />
          </div>
        )}
      </main>
    </div>
  );
}
