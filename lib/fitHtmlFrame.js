/** The floor an unmeasured info frame renders at, and the smallest fit result. */
export const INFO_FRAME_MIN_HEIGHT = 40;

/** Measure the loaded srcdoc, never the iframe's initial about:blank document. */
export function fitHtmlFrame(frame) {
  const doc = frame?.contentDocument;
  if (
    !doc?.documentElement ||
    !doc.body ||
    doc.URL !== 'about:srcdoc' ||
    doc.readyState !== 'complete' ||
    frame.getBoundingClientRect().width <= 0
  ) return null;

  // A cached height is only a starting size. Keeping it as a minimum prevents
  // the panel from shrinking after an edit or a change in viewport width.
  frame.style.height = '0px';
  const height = Math.max(
    doc.documentElement.scrollHeight,
    doc.body.scrollHeight,
    doc.documentElement.offsetHeight,
    doc.body.offsetHeight,
    INFO_FRAME_MIN_HEIGHT,
  );
  // Restore the fitted size synchronously; no paint may see the zero height.
  frame.style.height = `${height}px`;
  return height;
}
