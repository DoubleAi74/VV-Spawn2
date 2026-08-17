"use client";

/**
 * lib/uploadFile.js — the one way a file reaches R2 from the browser.
 *
 * Uploads used to be `fetch(signedUrl, { method: 'PUT', body })`, which gives
 * no progress events and no retry: a 40 KB thumbnail and a 100 MB video looked
 * identical ("Uploading…"), and a single dropped connection lost the whole post.
 *
 * This wraps XMLHttpRequest, which does expose `upload.onprogress`, in a
 * promise, and retries the attempts that are worth retrying.
 */

import { useCallback, useRef } from "react";

/** Attempts per file, including the first. Deliberately small. */
export const MAX_UPLOAD_ATTEMPTS = 3;

/** Backoff before attempts 2 and 3. */
const RETRY_DELAYS_MS = [1000, 2000];

/**
 * Presigned URLs are valid for 15 minutes. A retry inside that window reuses
 * the same URL; past this point the upload has been going long enough that the
 * signature may be about to expire, so it is re-presigned first.
 */
const PRESIGN_REUSE_WINDOW_MS = 13 * 60 * 1000;

export class UploadFailure extends Error {
  constructor(message, { status = 0, attempts = 0, cause } = {}) {
    super(message);
    this.name = "UploadFailure";
    this.status = status;
    this.attempts = attempts;
    this.cause = cause;
  }
}

const delay = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new UploadFailure("Upload cancelled", { status: 0 }));
      },
      { once: true }
    );
  });

/**
 * A 4xx is a verdict — the same request will be refused again, so retrying it
 * only wastes the user's connection. 408 and 429 are the two exceptions the
 * status code itself asks us to retry.
 */
function isRetryableStatus(status) {
  if (status === 0) return true; // network error, no response at all
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

/** PUT a body to a presigned URL, reporting progress. Resolves with the status. */
function putWithProgress({ signedUrl, body, contentType, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      // Without a computable length there is no honest fraction to report.
      if (!event.lengthComputable) return;
      onProgress(event.loaded / event.total, {
        loaded: event.loaded,
        total: event.total,
      });
    };

    xhr.onload = () => {
      // The body has left the browser; report 100% before resolving so a bar
      // never stops at 99% on a fast connection.
      if (onProgress && xhr.status >= 200 && xhr.status < 300) {
        onProgress(1, { loaded: body.size ?? 0, total: body.size ?? 0 });
      }
      resolve(xhr.status);
    };
    xhr.onerror = () => resolve(0);
    xhr.ontimeout = () => resolve(0);
    xhr.onabort = () =>
      reject(new UploadFailure("Upload cancelled", { status: 0 }));

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(body);
  });
}

/**
 * Upload one body to R2, presigning through `presign` and retrying the failures
 * that can succeed on a second try.
 *
 * `presign` must return `{ signedUrl, publicUrl }`. It is called once up front,
 * and again only if the upload has been running long enough for the signature
 * to be close to expiring.
 */
export async function uploadToPresigned({
  presign,
  presigned,
  body,
  contentType,
  onProgress,
  signal,
}) {
  let target = presigned || (await presign());
  let presignedAt = Date.now();
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw new UploadFailure("Upload cancelled");

    if (attempt > 1 && Date.now() - presignedAt > PRESIGN_REUSE_WINDOW_MS) {
      target = await presign();
      presignedAt = Date.now();
    }

    onProgress?.(0, { loaded: 0, total: body.size ?? 0 });
    const status = await putWithProgress({
      signedUrl: target.signedUrl,
      body,
      contentType,
      onProgress,
      signal,
    });

    if (status >= 200 && status < 300) return target.publicUrl;

    lastStatus = status;
    if (!isRetryableStatus(status)) {
      throw new UploadFailure(
        status === 413
          ? "That file is too large to upload."
          : "The upload was refused. Please check the file and try again.",
        { status, attempts: attempt }
      );
    }

    if (attempt < MAX_UPLOAD_ATTEMPTS) {
      await delay(RETRY_DELAYS_MS[attempt - 1], signal);
    }
  }

  throw new UploadFailure(
    lastStatus === 0
      ? "The connection dropped while uploading."
      : `The upload kept failing (${lastStatus}).`,
    { status: lastStatus, attempts: MAX_UPLOAD_ATTEMPTS }
  );
}

/**
 * Presign through the app's own route and upload, which is what four of the
 * five call sites need. The key prefix is derived server-side from the session
 * and a verified page (SEC-4) — `kind` and `pageId` are all the client sends.
 */
export async function uploadToStorage({
  kind,
  pageId,
  body,
  filename,
  contentType,
  onProgress,
  signal,
}) {
  const presign = async () => {
    const res = await fetch("/api/storage/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        contentType,
        kind,
        ...(pageId ? { pageId } : {}),
        fileSize: body.size,
      }),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new UploadFailure(detail.error || "Couldn't start the upload.", {
        status: res.status,
      });
    }
    return res.json();
  };

  return uploadToPresigned({ presign, body, contentType, onProgress, signal });
}

/**
 * Run `tasks` with at most `limit` in flight, preserving result order and
 * isolating failures to the task that failed.
 *
 * Matches MAX_CONCURRENT_CREATES in lib/useQueue.js: more than a handful of
 * parallel uploads on a phone connection makes every one of them slower.
 */
export const UPLOAD_CONCURRENCY = 4;

export async function runWithConcurrency(tasks, limit = UPLOAD_CONCURRENCY) {
  const results = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= tasks.length) return;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker)
  );
  return results;
}

/**
 * Remember what has already been uploaded, so retrying a failed save does not
 * re-upload the files that succeeded the first time. Keyed by the File itself,
 * which is stable for as long as the modal holds it.
 */
export function useUploadedOnce() {
  const cache = useRef(new Map());

  const uploadOnce = useCallback(async (key, run) => {
    if (!key) return run();
    if (cache.current.has(key)) return cache.current.get(key);
    const result = await run();
    cache.current.set(key, result);
    return result;
  }, []);

  const forget = useCallback((key) => {
    if (key) cache.current.delete(key);
    else cache.current.clear();
  }, []);

  return { uploadOnce, forget };
}
