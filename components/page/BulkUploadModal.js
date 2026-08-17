"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  X,
  Upload,
  Image as ImageIcon,
  Trash2,
  Loader2,
  CheckCircle,
} from "lucide-react";
import Modal from "@/components/Modal";
import UploadProgressBar from "@/components/UploadProgressBar";
import { useToast } from "@/context/ToastContext";
import { processImageForUpload, fetchServerBlur } from "@/lib/processImage";
import {
  UPLOAD_CONCURRENCY,
  runWithConcurrency,
  uploadToPresigned,
} from "@/lib/uploadFile";

// One batch presign request covers this many files, and the route refuses more.
const MAX_BATCH = 50;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB, same as both upload routes

function makeUploadItem(file) {
  return {
    id: crypto.randomUUID(),
    file,
    preview: URL.createObjectURL(file),
  };
}

export default function BulkUploadModal({
  files: initialFiles,
  page,
  onClose,
  onUploadComplete,
  onBackToSingle,
}) {
  const [files, setFiles] = useState(() =>
    (initialFiles || []).map(makeUploadItem),
  );
  const [progress, setProgress] = useState({}); // { [id]: 'pending' | 'processing' | 'uploading' | 'done' | 'error' }
  const [fileProgress, setFileProgress] = useState({}); // { [id]: 0..1 }
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const { showError } = useToast();
  // Posts already handed to the page. A retry must not create them twice.
  const deliveredRef = useRef(new Set());

  // The state initialiser above already built items for initialFiles; running
  // makeUploadItem again on mount would create a second set of object URLs and
  // orphan the first.
  const initialFilesRef = useRef(initialFiles);
  useEffect(() => {
    if (initialFilesRef.current === initialFiles) return;
    initialFilesRef.current = initialFiles;
    setFiles((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.preview));
      return (initialFiles || []).map(makeUploadItem);
    });
  }, [initialFiles]);

  // Revoke on unmount only, reading through a ref. Depending on `files` ran the
  // cleanup on every change to the array, revoking the previous array's URLs —
  // most of which the new array still uses, so earlier thumbnails went blank as
  // soon as more images were added.
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(
    () => () => {
      filesRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    },
    [],
  );

  const fileCountLabel = useMemo(
    () => `${files.length} image${files.length === 1 ? "" : "s"}`,
    [files.length],
  );

  // Everything here happens outside the state updater on purpose. An updater
  // must be pure, and React calls it twice in development — building the items
  // inside one both double-counted the message and leaked a second object URL
  // per file, which is the same class of bug REL-4 fixed.
  function addFiles(newFiles) {
    const images = newFiles.filter((file) => file.type.startsWith("image/"));
    const notImages = newFiles.length - images.length;
    const accepted = images.filter((file) => file.size <= MAX_FILE_SIZE);
    const tooLarge = images.length - accepted.length;

    const existingKeys = new Set(
      files.map((item) => `${item.file.name}_${item.file.size}`),
    );
    const fresh = [];
    let duplicates = 0;

    for (const file of accepted) {
      const key = `${file.name}_${file.size}`;
      if (existingKeys.has(key)) {
        duplicates++;
        continue;
      }
      if (files.length + fresh.length >= MAX_BATCH) break;
      fresh.push(makeUploadItem(file));
      existingKeys.add(key);
    }

    // Files used to be dropped in silence: anything past the fiftieth was
    // sliced off inside handleUpload and never mentioned.
    const overCap = accepted.length - duplicates - fresh.length;
    const reasons = [];
    if (notImages > 0) reasons.push(`${notImages} not an image`);
    if (tooLarge > 0) reasons.push(`${tooLarge} over the 100 MB limit`);
    if (duplicates > 0) reasons.push(`${duplicates} already selected`);
    if (overCap > 0) {
      reasons.push(`${overCap} over the ${MAX_BATCH}-image limit for one batch`);
    }
    setNotice(reasons.length > 0 ? `Not added: ${reasons.join(", ")}.` : "");

    if (fresh.length > 0) setFiles((prev) => [...prev, ...fresh]);
  }

  function removeFile(id) {
    setFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((item) => item.id !== id);
    });
    setProgress((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setFileProgress((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files || []));
  }

  async function handleUpload() {
    if (files.length === 0 || uploading) return;

    setUploading(true);
    setError("");

    // Only the files that have not already been uploaded and turned into a
    // post. Retrying after a partial failure re-uploads exactly the failures.
    const pending = files.filter((item) => !deliveredRef.current.has(item.id));
    if (pending.length === 0) {
      setUploading(false);
      onClose();
      return;
    }

    try {
      // Canvas work is main-thread, so this stays sequential; the upload phase
      // below is where the parallelism pays.
      const processed = [];
      for (const item of pending) {
        setProgress((prev) => ({ ...prev, [item.id]: "processing" }));
        try {
          const { file: compressed, blurDataURL, needsServerBlur } =
            await processImageForUpload(item.file);
          processed.push({ item, compressed, blurDataURL, needsServerBlur });
        } catch {
          setProgress((prev) => ({ ...prev, [item.id]: "error" }));
        }
      }

      if (processed.length === 0) {
        setError("No valid images were processed.");
        setUploading(false);
        return;
      }

      const presignBatch = async () => {
        const res = await fetch("/api/storage/upload-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "photo",
            pageId: page._id,
            files: processed.map(({ item, compressed }) => ({
              clientId: item.id,
              filename: compressed.name,
              contentType: compressed.type || "image/jpeg",
              fileSize: compressed.size,
            })),
          }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail.error || "Failed to get upload URLs");
        }
        const { urls } = await res.json();
        return Object.fromEntries(urls.map((entry) => [entry.clientId, entry]));
      };

      let urlMap = await presignBatch();

      const tasks = processed.map(
        ({ item, compressed, blurDataURL: clientBlur, needsServerBlur }) =>
          async () => {
            const urlInfo = urlMap[item.id];
            if (!urlInfo) throw new Error("No upload URL for this file");

            setProgress((prev) => ({ ...prev, [item.id]: "uploading" }));
            const contentType = compressed.type || "image/jpeg";
            const publicUrl = await uploadToPresigned({
              presigned: urlInfo,
              // Only reached if the whole batch has been uploading long enough
              // for the signatures to be near expiry.
              presign: async () => {
                urlMap = await presignBatch();
                return urlMap[item.id];
              },
              body: compressed,
              contentType,
              onProgress: (fraction) =>
                setFileProgress((prev) => ({ ...prev, [item.id]: fraction })),
            });

            const blurDataURL = needsServerBlur
              ? await fetchServerBlur(publicUrl)
              : clientBlur;
            setProgress((prev) => ({ ...prev, [item.id]: "done" }));
            return {
              id: item.id,
              payload: { content: publicUrl, thumbnail: publicUrl, blurDataURL },
            };
          },
      );

      const results = await runWithConcurrency(tasks, UPLOAD_CONCURRENCY);

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          setProgress((prev) => ({
            ...prev,
            [processed[index].item.id]: "error",
          }));
        }
      });

      // Hand the successes over one at a time, in the order they were chosen.
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const { id, payload } = result.value;
        if (deliveredRef.current.has(id)) continue;
        deliveredRef.current.add(id);
        await onUploadComplete(payload);
      }

      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        // The modal stays open with the successes marked done, so the retry
        // only re-uploads what failed.
        const message = `${failed.length} of ${processed.length} image${
          processed.length === 1 ? "" : "s"
        } didn't upload`;
        setError(`${message}. The rest were added — press Upload again to retry.`);
        showError(message, failed[0].reason?.message || "The connection dropped.", {
          action: { label: "Retry the failed images", onAction: () => handleUpload() },
        });
        return;
      }

      onClose();
    } catch (err) {
      setError(err.message || "Bulk upload failed");
      showError("Couldn't upload those images", err.message || "Please try again.", {
        action: { label: "Try again", onAction: () => handleUpload() },
      });
    } finally {
      setUploading(false);
    }
  }

  // One bar for the batch: per-file bars in a fifty-image grid are noise.
  const aggregateProgress = (() => {
    if (!uploading) return null;
    const relevant = files.filter((item) => !deliveredRef.current.has(item.id));
    if (relevant.length === 0) return null;
    const total = relevant.reduce(
      (sum, item) =>
        sum + (progress[item.id] === "done" ? 1 : fileProgress[item.id] || 0),
      0,
    );
    return total / relevant.length;
  })();

  const retryCount = files.filter((item) => progress[item.id] === "error").length;
  const canSubmit = files.length > 0 && !uploading;

  return (
    <Modal
      onClose={onClose}
      ariaLabel="Upload multiple images"
      backdropClassName="fixed inset-0 z-[200] bg-black/20 flex items-center justify-center p-4"
      className="bg-neutral-900/90 backdrop-blur-[4px] border border-white/[0.08] rounded-[5px] p-6 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl shadow-black/50"
    >
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div className="flex items-center gap-4">
          {onBackToSingle && (
            <button
              type="button"
              onClick={onBackToSingle}
              className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-[2px] bg-white/[0.06] hover:bg-white/12 active:bg-white/15 text-white/50 hover:text-white/90 transition-all duration-150"
            >
              <ArrowLeft className="h-4 w-5" />
              Single
            </button>
          )}
          <h2 className="hidden sm:block text-lg font-semibold text-white">
            Upload Multiple Images
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-[2px] bg-white/[0.06] hover:bg-white/12 active:bg-white/15 text-white/50 hover:text-white/90 transition-all duration-150"
        >
          <X className="w-4 h-4" />
          <span className="text-sm">Close</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[3px] border border-red-500/40 bg-red-500/15 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="mb-4 rounded-[3px] border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100/90"
        >
          {notice}
        </div>
      )}

      <div className="flex-grow overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <form id="bulk-upload-form" className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">
              Select Images <span className="text-amber-400/80">*</span>
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`relative rounded-[3px] border-2 border-dashed px-4 py-6 transition-all duration-150 ${
                isDragging
                  ? "border-white/35 bg-white/[0.08]"
                  : "border-white/15 bg-white/[0.03]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                onChange={(e) => addFiles(Array.from(e.target.files || []))}
                className="hidden"
                id="bulk-upload-input"
                disabled={uploading}
              />
              <label
                htmlFor="bulk-upload-input"
                className={`flex items-center justify-center gap-2 text-sm text-white/60 cursor-pointer hover:text-white/80 transition-colors duration-150 ${
                  uploading ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Uploading {fileCountLabel}...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    <span>Click to select images or drag and drop</span>
                  </>
                )}
              </label>
            </div>
          </div>

          {files.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Selected ({fileCountLabel})
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 max-h-[300px] overflow-y-auto p-2 bg-white/[0.02] rounded-[3px] border border-white/[0.06]">
                {files.map((item) => (
                  <div
                    key={item.id}
                    className="relative group aspect-square rounded-[2px] overflow-hidden border border-white/10 bg-white/[0.03]"
                  >
                    {/\.(heic|heif)$/i.test(item.file.name) || item.file.type === "image/heic" || item.file.type === "image/heif" ? (
                      <div className="w-full h-full flex items-center justify-center bg-emerald-500/10">
                        <CheckCircle className="w-6 h-6 text-emerald-400/80" />
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.preview}
                        alt={item.file.name}
                        className="w-full h-full object-cover"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => removeFile(item.id)}
                      className="absolute top-1 right-1 p-1 rounded-[2px] bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-red-500"
                      aria-label={`Remove ${item.file.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>

                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 text-[10px] text-white/70 truncate">
                      {item.file.name}
                    </div>

                    {progress[item.id] === "processing" && (
                      <div className="absolute inset-0 bg-black/45 grid place-items-center">
                        <Loader2 className="w-4 h-4 text-white/80 animate-spin" />
                      </div>
                    )}
                    {progress[item.id] === "uploading" && (
                      <div className="absolute inset-0 bg-black/45 grid place-items-center">
                        <span className="text-[11px] font-medium text-white/85">
                          {Math.round((fileProgress[item.id] || 0) * 100)}%
                        </span>
                      </div>
                    )}
                    {progress[item.id] === "done" && (
                      <div className="absolute inset-0 bg-emerald-900/40 grid place-items-center">
                        <CheckCircle className="w-4 h-4 text-emerald-200/90" />
                      </div>
                    )}
                    {progress[item.id] === "error" && (
                      <div className="absolute inset-0 bg-red-900/45 grid place-items-center">
                        <ImageIcon className="w-4 h-4 text-red-200/90" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-white/40">
            Each image will be uploaded as a separate post with an empty title
            and description.
          </p>
        </form>
      </div>

      <UploadProgressBar
        value={aggregateProgress}
        label={`Uploading ${fileCountLabel}`}
      />

      <div className="flex gap-3 pt-4 mt-auto flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-[3px] bg-white/[0.04] border border-white/[0.08] text-white/50 font-medium hover:bg-white/[0.08] hover:border-white/15 hover:text-white/70 active:bg-white/12 transition-all duration-150"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleUpload}
          className="flex-1 py-2.5 rounded-[3px] bg-neutral-100/90 text-neutral-900 font-semibold hover:bg-neutral-100 active:bg-neutral-100/80 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-neutral-100/90 transition-all duration-100 shadow-lg shadow-white/10"
          disabled={!canSubmit}
        >
          {uploading
            ? "Uploading..."
            : retryCount > 0
              ? `Retry ${retryCount} image${retryCount === 1 ? "" : "s"}`
              : `Upload ${fileCountLabel}`}
        </button>
      </div>
    </Modal>
  );
}
