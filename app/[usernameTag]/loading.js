"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import ImageWithLoader from "@/components/ImageWithLoader";
import { getDashboardSnapshot } from "@/lib/routeTransitionCache";

function normalizeHex(hex, fallback) {
  const value = String(hex || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return fallback;
}

function lighten(hex, amount = 30) {
  const safeHex = normalizeHex(hex, "#2d3e50").replace("#", "");
  let r = parseInt(safeHex.substring(0, 2), 16);
  let g = parseInt(safeHex.substring(2, 4), 16);
  let b = parseInt(safeHex.substring(4, 6), 16);

  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));

  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function DashboardLoadingCard({ page }) {
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

export default function DashboardLoading() {
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
          <div className="flex items-center min-h-[70px] sm:min-h-[90px] px-6 sm:px-8">
            {snapshot?.usernameTitle ? (
              <h1
                className="text-2xl sm:text-4xl font-extrabold tracking-tight truncate"
                style={{ color: lighten(dashHex, 245) }}
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
            style={{ backgroundColor: lighten(dashHex, 30) }}
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
