const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;
const SOFT_HYPHEN_PATTERN = /\u00ad/g;
const WBR_PATTERN = /<wbr\s*\/?>/gi;
const ZERO_WIDTH_PATTERN = /[\u200b-\u200d\ufeff]/g;
const NBSP_ENTITY_PATTERN = /&(nbsp|#160|#xa0);/gi;

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const stripHtmlForVisibility = (html) =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(NBSP_ENTITY_PATTERN, " ")
    .replace(ZERO_WIDTH_PATTERN, "")
    .trim();

export const normalizeRichTextHtml = (value = "") =>
  String(value).replace(SOFT_HYPHEN_PATTERN, "").replace(WBR_PATTERN, "");

export const hasVisibleRichText = (value = "") =>
  stripHtmlForVisibility(normalizeRichTextHtml(value)).length > 0;

export const buildRenderableRichText = (value = "") => {
  const normalized = normalizeRichTextHtml(value);
  const hasContent = hasVisibleRichText(normalized);

  if (!hasContent) {
    return { html: "", hasContent: false };
  }

  if (HTML_TAG_PATTERN.test(normalized)) {
    return { html: normalized, hasContent: true };
  }

  return {
    html: escapeHtml(normalized).replace(/\n/g, "<br />"),
    hasContent: true,
  };
};
