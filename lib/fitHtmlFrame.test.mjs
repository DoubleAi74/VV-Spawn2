import test from 'node:test';
import assert from 'node:assert/strict';
import { fitHtmlFrame } from './fitHtmlFrame.js';

function frameWithContent(height, { url = 'about:srcdoc', readyState = 'complete', width = 370, initialHeight = 40 } = {}) {
  const style = { height: `${initialHeight}px` };
  const root = {
    // A document can report its viewport height when that exceeds its content.
    get scrollHeight() { return Math.max(height, parseFloat(style.height)); },
    get offsetHeight() { return Math.max(height, parseFloat(style.height)); },
  };
  return {
    style,
    getBoundingClientRect: () => ({ width }),
    contentDocument: {
      URL: url,
      readyState,
      documentElement: root,
      body: { scrollHeight: height, offsetHeight: height },
    },
  };
}

test('the initial about:blank document never becomes a cached measurement', () => {
  const frame = frameWithContent(0, { url: 'about:blank', initialHeight: 400 });
  assert.equal(fitHtmlFrame(frame), null);
  assert.equal(frame.style.height, '400px');
});

test('partially loaded srcdoc remains pending', () => {
  for (const readyState of ['loading', 'interactive']) {
    const frame = frameWithContent(150, { readyState });
    assert.equal(fitHtmlFrame(frame), null);
    assert.equal(frame.style.height, '40px');
  }
});

test('a loaded panel is expanded before its measurement is published', () => {
  const frame = frameWithContent(376);
  assert.equal(fitHtmlFrame(frame), 376);
  assert.equal(frame.style.height, '376px');
});

test('a stale cached height can shrink after content or viewport changes', () => {
  const frame = frameWithContent(220, { initialHeight: 700, width: 900 });
  assert.equal(fitHtmlFrame(frame), 220);
  assert.equal(frame.style.height, '220px');
});

test('an unavailable layout is not measured and an empty loaded panel has a minimum', () => {
  assert.equal(fitHtmlFrame(null), null);
  assert.equal(fitHtmlFrame(frameWithContent(500, { width: 0 })), null);
  const empty = frameWithContent(0);
  assert.equal(fitHtmlFrame(empty), 40);
  assert.equal(empty.style.height, '40px');
});
