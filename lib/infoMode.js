export const INFO_MODE_TEXT = 'text';
export const INFO_MODE_HTML = 'html';

export function looksLikeHtmlDocument(text) {
  return /<!DOCTYPE|<html[\s>]|<style[\s>]/i.test(String(text || ''));
}

/** Explicit saved mode, or infer from existing blobs so thesis HTML opens as HTML. */
export function normalizeInfoMode(value, text = '') {
  if (value === INFO_MODE_HTML || value === INFO_MODE_TEXT) return value;
  return looksLikeHtmlDocument(text) ? INFO_MODE_HTML : INFO_MODE_TEXT;
}
