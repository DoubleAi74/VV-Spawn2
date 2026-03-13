'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { processImageForUpload } from '@/lib/processImage';

export default function CreatePageModal({ onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
    e.preventDefault();
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
      const { file: compressed, blurDataURL } = await processImageForUpload(thumbnailFile);
      const presignRes = await fetch('/api/storage/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: compressed.name,
          contentType: 'image/jpeg',
          folder: 'pages/thumbnails',
          fileSize: compressed.size,
        }),
      });
      if (!presignRes.ok) throw new Error('Failed to get upload URL');
      const { signedUrl, publicUrl } = await presignRes.json();

      await fetch(signedUrl, {
        method: 'PUT',
        body: compressed,
        headers: { 'Content-Type': 'image/jpeg' },
      });

      await onCreate({
        title: title.trim(),
        description: subtitle.trim(),
        isPrivate,
        thumbnail: publicUrl,
        blurDataURL,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = Boolean(title.trim()) && Boolean(thumbnailFile) && !loading;

  return (
    <div
      className="fixed inset-0 bg-black/20 flex items-center justify-center z-[200] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-neutral-900/90 backdrop-blur-[4px] border border-white/[0.08] rounded-[5px] p-6 w-full max-w-md shadow-2xl shadow-black/50">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold text-white">Create New Page</h2>
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
              onChange={(e) => setTitle(e.target.value)}
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
      </div>
    </div>
  );
}
