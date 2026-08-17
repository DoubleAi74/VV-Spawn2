"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Root error boundary. Without it, a thrown server component — an unreachable
 * database, most likely — shows a visitor Next's raw error screen.
 */
export default function GlobalError({ error, reset }) {
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
        Something went wrong
      </h1>
      <p className="text-gray-500 text-sm mb-6 max-w-sm text-center">
        This is our end, not yours. Nothing you have saved is affected — try
        again in a moment.
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
        <Link
          href="/"
          className="px-4 py-2 bg-white text-gray-800 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
