"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import ImageWithLoader from "@/components/ImageWithLoader";
import { getPageSnapshot } from "@/lib/routeTransitionCache";

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

function hexToRgba(hex, alpha = 1) {
  const safeHex = normalizeHex(hex, "#e5e7eb").replace("#", "");
  const r = parseInt(safeHex.substring(0, 2), 16);
  const g = parseInt(safeHex.substring(2, 4), 16);
  const b = parseInt(safeHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function PostLoadingCard({ post }) {
  const title = post?.title || "";
  const thumbnail = post?.thumbnail || "";
  const blurDataURL = post?.blurDataURL || "";

  return (
    <div className="w-full p-1 rounded-[2px] bg-neutral-200/60 shadow-lg border-[3px] border-neutral-800/20 h-full flex flex-col">
      <div
        className="w-full aspect-[4/3] rounded-sm overflow-hidden relative"
        style={{
          backgroundImage: blurDataURL ? `url("${blurDataURL}")` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: !blurDataURL ? "#a3a3a3" : undefined,
        }}
      >
        {thumbnail ? (
          <ImageWithLoader
            src={thumbnail}
            alt={title || "Post preview"}
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

      <div className="px-1 pt-[4px] truncate text-xs font-bold text-neutral-800/85">
        {title || (
          <span className="inline-block h-3 w-3/5 rounded-[2px] bg-neutral-800/10 align-middle" />
        )}
      </div>
    </div>
  );
}

export default function PageViewLoading() {
  const params = useParams();
  const usernameTag =
    typeof params?.usernameTag === "string" ? params.usernameTag : "";
  const pageSlug = typeof params?.pageSlug === "string" ? params.pageSlug : "";
  const snapshot = getPageSnapshot(usernameTag, pageSlug);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const dashHex = normalizeHex(snapshot?.dashHex, "#3b3b3b");
  const backHex = normalizeHex(snapshot?.backHex, "#cccccc");
  const posts = snapshot?.posts?.length ? snapshot.posts : [];

  return (
    <div
      className="min-h-screen w-full p-0 md:px-6 overscroll-none flex flex-col"
      style={{ backgroundColor: hexToRgba(backHex, 0.5) }}
    >
      <header
        className="sticky top-0 left-0 right-0 z-40 shadow-md"
        style={{
          backgroundColor: dashHex,
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <div className="flex items-center justify-between min-h-[52px] sm:min-h-[64px] px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0 w-full">
            <div className="h-8 w-8 rounded-[3px] border border-white/20 bg-white/10" />
            {snapshot?.pageTitle ? (
              <h1
                className="text-xl sm:text-2xl font-bold tracking-wide truncate"
                style={{ color: lighten(dashHex, 245) }}
              >
                {snapshot.pageTitle}
              </h1>
            ) : (
              <div className="h-6 w-44 sm:w-60 rounded-[3px] bg-white/20 animate-pulse" />
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

      <main
        className="w-full flex-1 px-2 sm:px-4 md:px-5 pt-[1.8rem] pb-72"
        style={{ backgroundColor: hexToRgba(backHex, 1) }}
      >
        <div className="max-w-7xl mx-auto">
          {posts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[7px] sm:gap-4">
              {posts.map((post, index) => (
                <PostLoadingCard
                  key={post._id || `skeleton-${index}`}
                  post={post}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center pt-[0px] mt-[-305px] pr-[30px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/vv-grey.png"
                alt=""
                className="w-[1300px] h-[1300px] max-w-none opacity-30"
                // className="w-[690px] h-[690px] opacity-20"
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
