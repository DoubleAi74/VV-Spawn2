"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

/**
 * Error boundary for a profile and everything under it. Kept separate from the
 * root one so a failure inside somebody's collection can offer the way back to
 * that collection rather than to the marketing page.
 */
export default function ProfileError({ error, reset }) {
  const params = useParams();
  const usernameTag = params?.usernameTag;

  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();

  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  // reset() alone re-renders the segment from the payload it already has, which
  // for a thrown server component is the same failure again. The refresh is
  // what actually re-runs it on the server.
  function retry() {
    startRetry(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <p className="text-7xl font-light text-gray-200 mb-4 select-none">!</p>
      <h1 className="text-xl font-semibold text-gray-800 mb-2">
        This page couldn&apos;t be loaded
      </h1>
      <p className="text-gray-500 text-sm mb-6 max-w-sm text-center">
        Something went wrong on our side. Nothing that has been saved is
        affected — try again in a moment.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={retry}
          disabled={isRetrying}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          {isRetrying ? "Trying…" : "Try again"}
        </button>
        {usernameTag ? (
          <Link
            href={`/${usernameTag}`}
            className="px-4 py-2 bg-white text-gray-800 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            Back to the dashboard
          </Link>
        ) : null}
      </div>
    </div>
  );
}
