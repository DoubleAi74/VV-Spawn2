'use client';

import { useEffect } from 'react';
import { X, ExternalLink, Download } from 'lucide-react';
import sanitizeHtml from 'sanitize-html';

const SANITIZE_OPTIONS = {
  allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
};

export default function PostFileModal({ post, onClose }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleDownload() {
    const res = await fetch(post.content);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = post.title || 'file';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <dialog
      open
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 w-full h-full"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 truncate pr-4">
            {post.title || 'File'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {post.description && post.description !== '<p><br></p>' && (
          <div
            className="quill-output mb-4 text-sm"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(post.description, SANITIZE_OPTIONS),
            }}
          />
        )}

        <div className="flex gap-3">
          <a
            href={post.content}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 flex-1 justify-center px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            <ExternalLink size={15} />
            Open
          </a>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-2 flex-1 justify-center px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Download size={15} />
            Download
          </button>
        </div>
      </div>
    </dialog>
  );
}
