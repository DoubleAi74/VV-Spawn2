'use client';

import { useRef, useState } from 'react';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import Modal from '@/components/Modal';
import UploadProgressBar from '@/components/UploadProgressBar';
import { useToast } from '@/context/ToastContext';
import { processImageForUpload, fetchServerBlur } from '@/lib/processImage';
import { toBaseSlug } from '@/lib/slug';
import { uploadToStorage, useUploadedOnce } from '@/lib/uploadFile';

export default function CreatePageModal({ onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const fileRef = useRef(null);
  const { showError } = useToast();
  // A failed create must not re-upload a thumbnail that already landed.
  const { uploadOnce } = useUploadedOnce();

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
    const url = URL.createObjectURL(file);
    setThumbnailPreview(url);
    setThumbnailFile(file);
    setError('');
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    if (!title.trim()) {
      setError('Page title is required');
      return;
    }
    if (!thumbnailFile) {
      setError('Thumbnail image is required');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const uploaded = await uploadOnce(thumbnailFile, async () => {
        const { file: compressed, blurDataURL: clientBlur, needsServerBlur } =
          await processImageForUpload(thumbnailFile);
        const contentType = compressed.type || 'image/jpeg';
        const publicUrl = await uploadToStorage({
          kind: 'page-thumbnail',
          body: compressed,
          filename: compressed.name,
          contentType,
          onProgress: setProgress,
        });
        return {
          thumbnail: publicUrl,
          blurDataURL: needsServerBlur ? await fetchServerBlur(publicUrl) : clientBlur,
        };
      });

      await onCreate({
        title: title.trim(),
        description: subtitle.trim(),
        ...(slugTouched && slug.trim() ? { slug: slug.trim() } : {}),
        isPrivate,
        thumbnail: uploaded.thumbnail,
        blurDataURL: uploaded.blurDataURL,
      });
      onClose();
    } catch (err) {
      // The modal stays open with everything the user typed still in it, and
      // the upload that succeeded is remembered, so "Create Page" resumes
      // rather than starting again.
      setError(err.message || 'Something went wrong');
      showError("Couldn't create the page", err.message || 'The upload did not finish.', {
        action: { label: 'Try again', onAction: () => handleSubmit(e) },
      });
    } finally {
      setProgress(null);
      setLoading(false);
    }
  }

  const canSubmit = Boolean(title.trim()) && Boolean(thumbnailFile) && !loading;

  return (
    <Modal
      onClose={onClose}
      labelledBy="create-page-modal-title"
      backdropClassName="fixed inset-0 bg-black/20 flex items-center justify-center z-[200] p-4"
      className="bg-neutral-900/90 backdrop-blur-[4px] border border-white/[0.08] rounded-[5px] p-6 w-full max-w-md shadow-2xl shadow-black/50"
    >
      <div className="flex justify-between items-center mb-6">
        <h2 id="create-page-modal-title" className="text-lg font-semibold text-white">Create New Page</h2>
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

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-white/60 mb-2">
            Page Title <span className="text-amber-400/80">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              const val = e.target.value;
              setTitle(val);
              if (!slugTouched) setSlug(toBaseSlug(val));
            }}
            className="w-full px-4 py-2.5 rounded-[3px] bg-white/5 border border-white/10 text-white/90 placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-colors duration-150 focus:ring-1 focus:ring-white/10"
            placeholder="Enter page title"
            maxLength={200}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/60 mb-2">
            Brief subtitle
          </label>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="w-full px-4 py-2.5 rounded-[3px] bg-white/5 border border-white/10 text-white/90 placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-colors duration-150 focus:ring-1 focus:ring-white/10"
            placeholder="Enter subtitle"
            maxLength={500}
          />
        </div>

        <div>
          <div className="flex justify-between items-baseline mb-2">
            <label className="block text-sm font-medium text-white/60">URL slug</label>
            <span className="text-xs text-white/30">{slugTouched ? 'Custom' : 'Auto-derived from title'}</span>
          </div>
          <input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            className="w-full px-4 py-2.5 rounded-[3px] bg-white/5 border border-white/10 text-white/90 placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-colors duration-150 focus:ring-1 focus:ring-white/10"
            placeholder="page-slug"
            maxLength={100}
          />
        </div>

        <div className="flex items-center gap-3 py-0 p-1 rounded-[3px]">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative inline-flex items-center">
              <input
                type="checkbox"
                id="isPrivateCheckbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="peer h-5 w-5 appearance-none rounded-[2px] border border-white/20 bg-white/[0.04] checked:bg-slate-700/80 checked:border-slate-500/90 transition-colors duration-150 cursor-pointer"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="white"
                className="pointer-events-none absolute inset-0 m-auto hidden h-3 w-3 peer-checked:block"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <span className="text-sm text-white/70 leading-tight">
              Private page
              <br />
              <span className="text-xs text-white/40">(visible only to you logged in)</span>
            </span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/60 mb-2">
            Thumbnail Image <span className="text-amber-400/80">*</span>
          </label>
          <div className="flex items-center gap-4">
            {thumbnailFile ? (
              <div className="w-16 h-16 rounded-[1px] overflow-hidden border-2 border-emerald-500/40 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailPreview}
                  alt="Thumbnail Preview"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-[3px] bg-white/[0.03] border border-dashed border-white/15 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-white/20" />
              </div>
            )}

            <div className="flex-1 relative">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.heic,.heif"
                onChange={handleFileChange}
                className="hidden"
                id="thumbnail-upload"
                disabled={loading}
              />
              <label
                htmlFor="thumbnail-upload"
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-[3px] bg-white/[0.06] border border-white/10 text-sm text-white/60 cursor-pointer hover:bg-white/10 hover:text-white/80 hover:border-white/15 active:bg-white/15 transition-all duration-150 ${
                  loading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <Upload className="w-4 h-4" />
                {loading ? 'Processing...' : thumbnailFile ? 'Change Image' : 'Select Image'}
              </label>
              {thumbnailFile?.name && (
                <p
                  className="absolute top-full mt-1.5 text-xs text-white/40 truncate max-w-[180px]"
                  title={thumbnailFile.name}
                >
                  {thumbnailFile.name}
                </p>
              )}
            </div>
          </div>
        </div>

        <UploadProgressBar value={progress} label="Uploading thumbnail" />

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-[3px] bg-white/[0.04] border border-white/[0.08] text-white/50 font-medium hover:bg-white/[0.08] hover:border-white/15 hover:text-white/70 active:bg-white/12 transition-all duration-150"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-2.5 rounded-[3px] bg-neutral-100/90 text-neutral-900 font-semibold hover:bg-neutral-100 active:bg-neutral-100/80 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-neutral-100/90 transition-all duration-100 shadow-lg shadow-white/10"
            disabled={!canSubmit}
          >
            {loading ? 'Creating...' : 'Create Page'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
