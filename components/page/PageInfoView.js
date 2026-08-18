'use client';

import { useMemo } from 'react';
import EmbeddedHtmlFrame from '@/components/dashboard/EmbeddedHtmlFrame';
import { getInfoPalette } from '@/lib/colour';
import { INFO_MODE_HTML, normalizeInfoMode } from '@/lib/infoMode';
import { sanitizeRichText } from '@/lib/sanitize';

export function hasVisibleInfo(value) {
  return Boolean(value && value !== '<p><br></p>' && String(value).trim() !== '');
}

/**
 * View-only info box. Shared by live views and loading skeletons so the
 * info slot is the same height on both paints.
 */
export default function PageInfoView({
  value,
  mode,
  backHex,
  title = 'Page info',
  initialHeight,
  onHeight,
  className = 'w-full block',
  contentClassName = 'page-content',
}) {
  const palette = useMemo(() => getInfoPalette(backHex), [backHex]);
  if (!hasVisibleInfo(value)) return null;

  if (normalizeInfoMode(mode, value) === INFO_MODE_HTML) {
    return (
      <section className={className}>
        <EmbeddedHtmlFrame
          html={value}
          title={title}
          initialHeight={initialHeight}
          onHeight={onHeight}
        />
      </section>
    );
  }

  return (
    <section className={className}>
      <div
        className="w-full rounded-[3px] text-base leading-relaxed font-sans break-words outline-none overflow-hidden px-3.5 py-[8px] border whitespace-normal"
        style={{
          backgroundColor: palette.panelBackground,
          borderColor: palette.panelBorder,
          color: palette.textColor,
        }}
      >
        <div
          className={contentClassName}
          dangerouslySetInnerHTML={{
            __html: sanitizeRichText(value || '') || '\u00A0',
          }}
        />
      </div>
    </section>
  );
}
