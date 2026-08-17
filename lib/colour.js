/**
 * lib/colour.js — the one definition of the theme colour maths.
 *
 * `normalizeHex`, `hexToRgb`, `hexToRgba`, `mixHex`, `lighten`, `getLuminance`
 * and `getInfoPalette` were spread across `PageInfoEditor`,
 * `DashboardInfoEditor`, `DashHeader`, `ThemeContext` and both `loading.js`
 * files — roughly 250 lines of near-identical code, with the fallback colour
 * quietly different in each copy.
 *
 * No imports: this is shared by client components and by anything that needs
 * the luminance logic on its own.
 */

/** Used when a value is not a usable 6-digit hex and the caller names no other. */
export const FALLBACK_HEX = '#000000';

/** The colour the info-editor palette assumes when the background is unusable. */
export const DEFAULT_INFO_BACKGROUND_HEX = '#e5e7eb';

export function normalizeHex(hex, fallback = FALLBACK_HEX) {
  const value = String(hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value}`;
  return fallback;
}

export function hexToRgb(hex, fallback = FALLBACK_HEX) {
  const safeHex = normalizeHex(hex, fallback).replace('#', '');
  return {
    r: parseInt(safeHex.slice(0, 2), 16),
    g: parseInt(safeHex.slice(2, 4), 16),
    b: parseInt(safeHex.slice(4, 6), 16),
  };
}

export function hexToRgba(hex, alpha = 1, fallback = FALLBACK_HEX) {
  const { r, g, b } = hexToRgb(hex, fallback);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const toHexPair = (value) => value.toString(16).padStart(2, '0');

/** Shift every channel by `amount`, clamped to 0–255. Negative darkens. */
export function lighten(hex, amount = 30, fallback = FALLBACK_HEX) {
  const { r, g, b } = hexToRgb(hex, fallback);
  const shift = (channel) => Math.max(0, Math.min(255, channel + amount));
  return `#${toHexPair(shift(r))}${toHexPair(shift(g))}${toHexPair(shift(b))}`;
}

export function mixHex(baseHex, mixWithHex, weight = 0.5) {
  const base = hexToRgb(baseHex);
  const mix = hexToRgb(mixWithHex);
  const clampedWeight = Math.max(0, Math.min(1, weight));
  const mixChannel = (start, end) =>
    Math.round(start + (end - start) * clampedWeight);

  return `#${toHexPair(mixChannel(base.r, mix.r))}${toHexPair(
    mixChannel(base.g, mix.g)
  )}${toHexPair(mixChannel(base.b, mix.b))}`;
}

/** Relative luminance, WCAG definition. 0 is black, 1 is white. */
export function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two colours. 1 is identical, 21 is black on white. */
export function contrastRatio(hexA, hexB) {
  const a = getLuminance(hexA);
  const b = getLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// Not pure white and pure black: against most backgrounds both are legible,
// and the softer pair sits better in a design that is otherwise all muted
// colour. Where softness would cost legibility, the pure pair takes over.
const LIGHT_INK = '#f8fafc';
const DARK_INK = '#111827';
const PURE_LIGHT_INK = '#ffffff';
const PURE_DARK_INK = '#000000';

// WCAG AA for body text.
const MIN_TEXT_CONTRAST = 4.5;

function furtherFrom(backgroundHex, lightInk, darkInk) {
  return contrastRatio(backgroundHex, lightInk) >= contrastRatio(backgroundHex, darkInk)
    ? lightInk
    : darkInk;
}

/**
 * A foreground colour that stays readable on any background the theme picker
 * can produce.
 *
 * The header title was `lighten(dashHex, 245)`, which for a pale header clamps
 * to near-white on near-white and the user's own name disappears. Picking by
 * measured contrast instead means white-on-white and black-on-black cannot
 * happen: whichever ink is further from the background wins.
 *
 * The softened pair is preferred, but it is not always enough — on saturated
 * backgrounds it falls short. `#111827` on pure red is 4.44:1, just under AA,
 * while true black is 5.25:1. Where the soft pair cannot reach AA the pure one
 * does, so the guarantee holds for every colour rather than most of them.
 */
export function readableInkOn(backgroundHex, fallback = FALLBACK_HEX) {
  const safe = normalizeHex(backgroundHex, fallback);
  const soft = furtherFrom(safe, LIGHT_INK, DARK_INK);
  if (contrastRatio(safe, soft) >= MIN_TEXT_CONTRAST) return soft;
  return furtherFrom(safe, PURE_LIGHT_INK, PURE_DARK_INK);
}

/**
 * The focus ring, for the same reason. The global ring was hardcoded to
 * #2d3e50, which vanishes against any dark custom theme — and a focus ring
 * nobody can see is the same as no keyboard affordance at all.
 */
export function focusRingOn(backgroundHex, fallback = FALLBACK_HEX) {
  return readableInkOn(backgroundHex, fallback);
}

/**
 * The info-editor panel palette, light or dark depending on the background it
 * sits on. Both info editors render the same panel, so the thresholds and the
 * colour values belong in one place.
 */
export function getInfoPalette(backgroundHex) {
  const safeBack = normalizeHex(backgroundHex, DEFAULT_INFO_BACKGROUND_HEX);
  const isDarkBackground = getLuminance(safeBack) < 0.26;

  if (isDarkBackground) {
    const surfaceHex = mixHex(safeBack, '#ffffff', 0.16);

    return {
      panelBackground: hexToRgba(surfaceHex, 0.74),
      panelBorder: hexToRgba('#ffffff', 0.16),
      panelShadow: '0 12px 28px rgba(0, 0, 0, 0.22)',
      textColor: 'rgba(248, 250, 252, 0.94)',
      mutedTextColor: 'rgba(226, 232, 240, 0.76)',
      textareaToneClasses:
        'text-white placeholder:text-white/35 caret-white focus:ring-white/15',
      statusBackground: hexToRgba('#ffffff', 0.08),
      statusBorder: hexToRgba('#ffffff', 0.12),
      errorBackground: 'rgba(127, 29, 29, 0.32)',
      errorBorder: 'rgba(248, 113, 113, 0.24)',
      errorText: 'rgba(254, 226, 226, 0.94)',
    };
  }

  return {
    panelBackground: 'rgba(255, 255, 255, 0.52)',
    panelBorder: 'rgba(163, 163, 163, 0.38)',
    panelShadow: '0 10px 24px rgba(15, 23, 42, 0.08)',
    textColor: 'rgba(23, 23, 23, 0.92)',
    mutedTextColor: 'rgba(82, 82, 91, 0.76)',
    textareaToneClasses:
      'text-neutral-900 placeholder:text-neutral-500/70 caret-neutral-900 focus:ring-neutral-400/20',
    statusBackground: 'rgba(255, 255, 255, 0.58)',
    statusBorder: 'rgba(255, 255, 255, 0.62)',
    errorBackground: 'rgba(254, 226, 226, 0.78)',
    errorBorder: 'rgba(248, 113, 113, 0.22)',
    errorText: 'rgba(153, 27, 27, 0.9)',
  };
}
