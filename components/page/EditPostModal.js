'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import {
  X,
  Upload,
  Image as ImageIcon,
  Link as LinkIcon,
  File as FileIcon,
} from 'lucide-react';
import RichTextEditorFallback, {
  RICH_TEXT_EDITOR_FRAME_HEIGHT_CLASS,
} from '@/components/page/RichTextEditorFallback';
import { clampOrderIndex } from '@/lib/ordering';
import { processImageForUpload } from '@/lib/processImage';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const TAB_ITEMS = [
  { value: 'photo', icon: ImageIcon, label: 'Photo' },
  { value: 'url', icon: LinkIcon, label: 'URL' },
  { value: 'file', icon: FileIcon, label: 'File' },
];

const RichTextEditor = dynamic(() => import('@/components/page/RichTextEditor'), {
  ssr: false,
  loading: () => <RichTextEditorFallback />,
});

function getPreviewForType(post, contentType) {
  if (contentType === 'photo') {
    return post.thumbnail || post.content || '';
  }
  return post.thumbnail || '';
}

function getFilenameFromUrl(url) {
  if (!url) return '';
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split('/').pop() || '');
  } catch {
    return '';
  }
}

export default function EditPostModal({ post, page, itemCount, onClose, onSave }) {
  const [title, setTitle] = useState(post.title || '');
  const [description, setDescription] = useState(post.description || '');
  const [contentType, setContentType] = useState(post.content_type || 'photo');
  const [url, setUrl] = useState(post.content || '');
  const [orderIndex, setOrderIndex] = useState(post.order_index || 1);
  const [photoFile, setPhotoFile] = useState(null);
  const [contentFile, setContentFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [filePreview, setFilePreview] = useState(
    getPreviewForType(post, post.content_type || 'photo')
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const imageRef = useRef(null);
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
    setTitle(post.title || '');
    setDescription(post.description || '');
    setContentType(post.content_type || 'photo');
    setUrl(post.content || '');
    setOrderIndex(post.order_index || 1);
    setPhotoFile(null);
    setContentFile(null);
    setThumbnailFile(null);
    setFilePreview(getPreviewForType(post, post.content_type || 'photo'));
    setError('');
  }, [post]);

  useEffect(() => {
    return () => {
      if (filePreview?.startsWith('blob:')) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function validateSize(nextFile) {
    if (nextFile.size > MAX_FILE_SIZE) {
      setError('File exceeds the 100 MB size limit');
      return false;
    }
    return true;
  }

  function handleImageChange(e) {
    const next = e.target.files?.[0];
    if (!next) return;
    if (!validateSize(next)) return;

    if (filePreview?.startsWith('blob:')) URL.revokeObjectURL(filePreview);
    setError('');
    const previewUrl = URL.createObjectURL(next);

    if (contentType === 'photo') {
      setPhotoFile(next);
      setThumbnailFile(null);
      setFilePreview(previewUrl);
      return;
    }

    setThumbnailFile(next);
    setFilePreview(previewUrl);
  }

  function handleFileChange(e) {
    const next = e.target.files?.[0];
    if (!next) return;
    if (!validateSize(next)) return;
    setError('');
    setContentFile(next);
  }

  function switchTab(nextType) {
    if (nextType === contentType) return;

    if (filePreview?.startsWith('blob:')) URL.revokeObjectURL(filePreview);

    setContentType(nextType);
    setPhotoFile(null);
    setContentFile(null);
    setThumbnailFile(null);
    setError('');
    setFilePreview(getPreviewForType(post, nextType));
  }

  async function uploadPhoto(nextFile) {
    const { file: compressed, blurDataURL } = await processImageForUpload(nextFile);
    const presignRes = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: compressed.name,
        contentType: 'image/jpeg',
        folder: `users/pages/${page._id}/posts`,
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
    return { content: publicUrl, thumbnail: publicUrl, blurDataURL };
  }

  async function uploadFile(nextFile) {
    const presignRes = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: nextFile.name,
        contentType: nextFile.type || 'application/octet-stream',
        folder: `users/pages/${page._id}/files`,
        fileSize: nextFile.size,
      }),
    });
    if (!presignRes.ok) throw new Error('Failed to get upload URL');
    const { signedUrl, publicUrl } = await presignRes.json();
    await fetch(signedUrl, {
      method: 'PUT',
      body: nextFile,
      headers: { 'Content-Type': nextFile.type || 'application/octet-stream' },
    });
    return { content: publicUrl };
  }

  async function uploadThumbnail(nextFile) {
    const { file: compressed, blurDataURL } = await processImageForUpload(nextFile);
    const presignRes = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: compressed.name,
        contentType: 'image/jpeg',
        folder: `users/pages/${page._id}/posts`,
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
    return { thumbnail: publicUrl, blurDataURL };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const updates = {
        title: title.trim(),
        description,
        content_type: contentType,
        order_index:
          orderIndex === ''
            ? post.order_index || 1
            : clampOrderIndex(orderIndex, itemCount || 1),
      };
      const existingThumbnailForType = getPreviewForType(post, contentType);

      if (contentType === 'url') {
        if (!url.trim()) {
          setError('URL is required');
          setLoading(false);
          return;
        }
        if (!thumbnailFile && !existingThumbnailForType) {
          setError('Thumbnail image is required');
          setLoading(false);
          return;
        }
        updates.content = url.trim();
        if (thumbnailFile) {
          const uploadedThumb = await uploadThumbnail(thumbnailFile);
          updates.thumbnail = uploadedThumb.thumbnail;
          updates.blurDataURL = uploadedThumb.blurDataURL;
        }
      }

      if (contentType === 'photo') {
        if (photoFile) {
          const uploaded = await uploadPhoto(photoFile);
          if (post.content) {
            await fetch('/api/storage/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileUrl: post.content }),
            }).catch(() => {});
          }
          updates.content = uploaded.content;
          updates.thumbnail = uploaded.thumbnail;
          updates.blurDataURL = uploaded.blurDataURL;
        } else if (post.content_type !== 'photo') {
          setError('Please select an image');
          setLoading(false);
          return;
        } else if (!existingThumbnailForType) {
          setError('Thumbnail image is required');
          setLoading(false);
          return;
        }
      }

      if (contentType === 'file') {
        if (contentFile) {
          const uploaded = await uploadFile(contentFile);
          if (post.content) {
            await fetch('/api/storage/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileUrl: post.content }),
            }).catch(() => {});
          }
          updates.content = uploaded.content;
        } else if (post.content_type !== 'file') {
          setError('Please select a file');
          setLoading(false);
          return;
        }
        if (!thumbnailFile && !existingThumbnailForType) {
          setError('Thumbnail image is required');
          setLoading(false);
          return;
        }
        if (thumbnailFile) {
          const uploadedThumb = await uploadThumbnail(thumbnailFile);
          updates.thumbnail = uploadedThumb.thumbnail;
          updates.blurDataURL = uploadedThumb.blurDataURL;
        }
      }

      await onSave(updates);
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const requiresNewPhoto = contentType !== post.content_type && contentType === 'photo';
  const requiresNewContentFile = contentType !== post.content_type && contentType === 'file';
  const existingFileName = post.content_type === 'file' ? getFilenameFromUrl(post.content) : '';
  const hasExistingThumbnailForType = Boolean(getPreviewForType(post, contentType));
  const maxOrderIndex = Math.max(1, itemCount || 1);
  const hasRequiredThumbnail =
    contentType === 'photo'
      ? Boolean(photoFile) || hasExistingThumbnailForType
      : Boolean(thumbnailFile) || hasExistingThumbnailForType;

  const canSubmit =
    !loading &&
    (contentType !== 'url' || Boolean(url.trim())) &&
    (!requiresNewPhoto || Boolean(photoFile)) &&
    (!requiresNewContentFile || Boolean(contentFile)) &&
    hasRequiredThumbnail;
  const hasImagePreview = Boolean(filePreview);
  const isImageSelected = contentType === 'photo' ? Boolean(photoFile) : Boolean(thumbnailFile);
  const selectedFileName =
    contentType === 'photo'
      ? photoFile?.name
      : contentType === 'url'
        ? thumbnailFile?.name
        : contentFile?.name || existingFileName || thumbnailFile?.name;
  const imageButtonLabel =
    loading
      ? 'Processing...'
      : contentType === 'photo'
        ? photoFile || hasImagePreview
          ? 'Change Image'
          : 'Select Image'
        : thumbnailFile || hasImagePreview
          ? 'Change Thumbnail'
          : 'Select Thumbnail';

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/20 flex items-center justify-center p-4"
    >
      <div className="bg-neutral-900/90 backdrop-blur-[4px] border border-white/[0.08] rounded-[5px] p-6 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl shadow-black/50">
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">
            {contentType === 'photo'
              ? 'Edit image post'
              : contentType === 'url'
                ? 'Edit URL post'
                : 'Edit file post'}
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 p-1 mr-3 rounded-[3px] bg-white/[0.03]">
              {TAB_ITEMS.map(({ value, icon: Icon, label }) => {
                const isActive = contentType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => switchTab(value)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[2px] text-xs font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-white/10 text-white/90 shadow-sm shadow-black/20'
                        : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
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
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-[3px] border border-red-500/40 bg-red-500/15 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        <div className="flex-grow overflow-y-auto pr-2">
          <form id="edit-post-form" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                className="w-full px-4 py-2.5 rounded-[3px] bg-white/5 border border-white/10 text-white/90 placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-colors duration-150 focus:ring-1 focus:ring-white/10"
                placeholder="Enter post title"
              />
            </div>

            {contentType === 'url' && (
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-[3px] bg-white/5 border border-white/10 text-white/90 placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-colors duration-150 focus:ring-1 focus:ring-white/10"
                  placeholder="https://example.com"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">
                Upload <span className="text-amber-400/80">*</span>
              </label>
              <div className="flex items-center gap-4">
                {hasImagePreview ? (
                  <div className="w-16 h-16 rounded-[1px] overflow-hidden border-2 border-emerald-500/40 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={filePreview}
                      alt="Thumbnail Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div
                    className={`w-16 h-16 rounded-[3px] flex items-center justify-center flex-shrink-0 ${
                      isImageSelected
                        ? 'border-2 border-emerald-500/40 bg-emerald-500/10'
                        : 'bg-white/[0.03] border border-dashed border-white/15'
                    }`}
                  >
                    <ImageIcon
                      className={`w-6 h-6 ${isImageSelected ? 'text-emerald-400/80' : 'text-white/20'}`}
                    />
                  </div>
                )}

                <div className="flex-1 relative">
                  <div className="flex gap-1 sm:gap-2 items-center">
                    <div className="flex-1">
                      <input
                        ref={imageRef}
                        type="file"
                        accept="image/*,.heic,.heif"
                        onChange={handleImageChange}
                        className="hidden"
                        id="edit-thumbnail-upload"
                        disabled={loading}
                      />
                      <label
                        htmlFor="edit-thumbnail-upload"
                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-[2px] bg-white/[0.06] border border-white/10 text-sm text-white/60 cursor-pointer hover:bg-white/10 hover:text-white/80 hover:border-white/15 active:bg-white/15 transition-all duration-150 ${
                          loading ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <Upload className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{imageButtonLabel}</span>
                      </label>
                    </div>

                    {contentType === 'file' && (
                      <div className="flex-1">
                        <input
                          ref={fileRef}
                          type="file"
                          onChange={handleFileChange}
                          className="hidden"
                          id="edit-content-file-upload"
                          disabled={loading}
                        />
                        <label
                          htmlFor="edit-content-file-upload"
                          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-[2px] bg-white/[0.06] border border-white/10 text-sm text-white/60 cursor-pointer hover:bg-white/10 hover:text-white/80 hover:border-white/15 active:bg-white/15 transition-all duration-150 ${
                            loading ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          <FileIcon className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">
                            {contentFile || existingFileName ? 'Change File' : 'Select File'}
                          </span>
                        </label>
                      </div>
                    )}
                  </div>

                  {selectedFileName && (
                    <div className="absolute top-full left-0 right-0 mt-1 flex justify-between text-xs">
                      <span className="text-white/40 truncate max-w-[90%] ml-1" title={selectedFileName}>
                        {selectedFileName}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-32">
                <label className="block text-sm text-end font-medium text-white/60 mt-[10px] mb-[7px]">
                  Order Index
                </label>
                <input
                  type="number"
                  min="1"
                  max={maxOrderIndex}
                  value={orderIndex}
                  onChange={(e) => {
                    const value = e.target.value;
                    setOrderIndex(value === '' ? '' : parseInt(value, 10));
                  }}
                  className="w-full px-4 py-2.5 rounded-[3px] bg-white/5 border border-white/10 text-white/90 placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-colors duration-150 focus:ring-1 focus:ring-white/10"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">Description</label>
              <div className={RICH_TEXT_EDITOR_FRAME_HEIGHT_CLASS}>
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Enter post description..."
                  variant="dark"
                  minHeight="80px"
                />
              </div>
            </div>
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
            type="submit"
            form="edit-post-form"
            className="flex-1 py-2.5 rounded-[3px] bg-neutral-100/90 text-neutral-900 font-semibold hover:bg-neutral-100 active:bg-neutral-100/80 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-neutral-100/90 transition-all duration-100 shadow-lg shadow-white/10"
            disabled={!canSubmit}
          >
            {loading ? 'Updating...' : 'Update Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
