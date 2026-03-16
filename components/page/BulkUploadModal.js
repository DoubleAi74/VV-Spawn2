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
import { processImageForUpload, fetchServerBlur } from "@/lib/processImage";

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
  const [progress, setProgress] = useState({}); // { [id]: 'pending' | 'uploading' | 'done' | 'error' }
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, []);

  useEffect(() => {
    setFiles((initialFiles || []).map(makeUploadItem));
  }, [initialFiles]);

  useEffect(
    () => () => {
      files.forEach((item) => URL.revokeObjectURL(item.preview));
    },
    [files],
  );

  const fileCountLabel = useMemo(
    () => `${files.length} image${files.length === 1 ? "" : "s"}`,
    [files.length],
  );

  function addFiles(newFiles) {
    const accepted = newFiles.filter((file) => file.type.startsWith("image/"));
    if (accepted.length === 0) return;

    setFiles((prev) => {
      const existingKeys = new Set(
        prev.map((item) => `${item.file.name}_${item.file.size}`),
      );
      const next = [...prev];

      for (const file of accepted) {
        const key = `${file.name}_${file.size}`;
        if (!existingKeys.has(key)) {
          next.push(makeUploadItem(file));
          existingKeys.add(key);
        }
      }

      return next;
    });
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

    try {
      const MAX_BATCH = 50;
      const batch = files.slice(0, MAX_BATCH);
      const processed = [];

      for (const item of batch) {
        setProgress((prev) => ({ ...prev, [item.id]: "uploading" }));
        try {
          const { file: compressed, blurDataURL, needsServerBlur } = await processImageForUpload(
            item.file,
          );
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

      const batchRes = await fetch("/api/storage/upload-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: processed.map(({ item, compressed }) => ({
            clientId: item.id,
            filename: compressed.name,
            contentType: compressed.type || "image/jpeg",
            folder: `users/pages/${page._id}/posts`,
          })),
        }),
      });

      if (!batchRes.ok) {
        setError("Failed to get upload URLs");
        setUploading(false);
        return;
      }

      const { urls } = await batchRes.json();
      const urlMap = Object.fromEntries(
        urls.map((entry) => [entry.clientId, entry]),
      );
      const uploaded = [];

      for (const { item, compressed, blurDataURL: clientBlur, needsServerBlur } of processed) {
        const urlInfo = urlMap[item.id];
        if (!urlInfo) {
          setProgress((prev) => ({ ...prev, [item.id]: "error" }));
          continue;
        }
        try {
          const contentType = compressed.type || "image/jpeg";
          await fetch(urlInfo.signedUrl, {
            method: "PUT",
            body: compressed,
            headers: { "Content-Type": contentType },
          });
          const blurDataURL = needsServerBlur ? await fetchServerBlur(urlInfo.publicUrl) : clientBlur;
          setProgress((prev) => ({ ...prev, [item.id]: "done" }));
          uploaded.push({
            content: urlInfo.publicUrl,
            thumbnail: urlInfo.publicUrl,
            blurDataURL,
          });
        } catch {
          setProgress((prev) => ({ ...prev, [item.id]: "error" }));
        }
      }

      for (const payload of uploaded) {
        await onUploadComplete(payload);
      }

      onClose();
    } catch (err) {
      setError(err.message || "Bulk upload failed");
    } finally {
      setUploading(false);
    }
  }

  const canSubmit = files.length > 0 && !uploading;

  return (
    <div className="fixed inset-0 z-[200] bg-black/20 flex items-center justify-center p-4">
      <div className="bg-neutral-900/90 backdrop-blur-[4px] border border-white/[0.08] rounded-[5px] p-6 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl shadow-black/50">
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

                      {progress[item.id] === "uploading" && (
                        <div className="absolute inset-0 bg-black/45 grid place-items-center">
                          <Loader2 className="w-4 h-4 text-white/80 animate-spin" />
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
            {uploading ? "Uploading..." : `Upload ${fileCountLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}
