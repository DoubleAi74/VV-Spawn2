'use client';

import { useEffect, useState } from 'react';
import { Check, X, Pencil } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function TitleEdit({
  currentTitle,
  currentTag,
  isEditMode,
  onSave,
  textColor = '#ffffff',
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentTitle);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { updateSession } = useAuth();

  useEffect(() => {
    setValue(currentTitle || '');
  }, [currentTitle]);

  const previewTag = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || currentTag;

  async function handleSave() {
    if (!value.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/user/title', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameTitle: value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save');
        return;
      }
      await updateSession({ usernameTag: data.usernameTag, usernameTitle: data.usernameTitle });
      setEditing(false);
      onSave?.(data.usernameTag, data.usernameTitle);
    } catch {
      setError('Failed to save');
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setValue(currentTitle);
    setEditing(false);
    setError('');
  }

  if (!isEditMode) {
    return (
      <h1
        className="text-2xl sm:text-4xl font-extrabold tracking-tight drop-shadow pr-2 break-words leading-tight truncate"
        style={{ color: textColor }}
      >
        {currentTitle}
      </h1>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-2 group min-w-0"
        aria-label="Edit display name"
      >
        <h1
          className="text-2xl sm:text-4xl font-extrabold tracking-tight drop-shadow pr-2 break-words leading-tight truncate"
          style={{ color: textColor }}
        >
          {currentTitle}
        </h1>
        <span className="h-7 w-7 sm:h-9 sm:w-9 mt-[2px] grid place-items-center rounded-[2px] border border-white/40 bg-black/20 backdrop-blur-sm transition-colors duration-150 group-hover:bg-black/30">
          <Pencil size={18} className="text-gray-200" />
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 w-full sm:w-[500px] max-w-[500px] p-2 pr-4 bg-black/35 backdrop-blur-md rounded-[4px] text-white">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={100}
          className="focus:outline-none text-neutral-900 w-full sm:w-4/5 px-2 py-1 rounded-[2px] bg-white"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="px-2 py-1 rounded-[2px] bg-white/20 hover:bg-white/30 text-white disabled:opacity-50"
          aria-label="Save name"
        >
          <Check size={16} />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="px-2 py-1 rounded-[2px] bg-white/10 hover:bg-white/20 text-white"
          aria-label="Cancel"
        >
          <X size={16} />
        </button>
      </div>
      <p className="text-xs font-semibold text-white/80">
        volvox.works/<span className="text-white/90">{previewTag}</span>
      </p>
      {error && <p className="text-xs text-red-300/90">{error}</p>}
    </div>
  );
}
