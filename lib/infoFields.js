import { normalizeInfoMode } from './infoMode.js';

export const DASHBOARD_INFO_FIELDS = [
  { text: 'infoText1', mode: 'infoMode1' },
  { text: 'infoText', mode: 'infoMode' },
];

export const PAGE_INFO_FIELDS = [
  { text: 'infoText1', mode: 'infoMode1' },
  { text: 'infoText2', mode: 'infoMode' },
];

export function normalizeInfoValues(source, fields) {
  return Object.fromEntries(fields.flatMap(({ text, mode }) => {
    const value = typeof source?.[text] === 'string' ? source[text] : '';
    return [[text, value], [mode, normalizeInfoMode(source?.[mode], value)]];
  }));
}

/** A PATCH changes only supplied fields; clearing a box requires an explicit ''. */
export function parseInfoPatch(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('Expected an object containing info fields');
  }
  const patch = {};
  for (const { text, mode } of fields) {
    if (Object.hasOwn(body, text)) {
      if (typeof body[text] !== 'string') throw new TypeError(`${text} must be text`);
      patch[text] = body[text];
    }
    if (Object.hasOwn(body, mode)) {
      if (body[mode] !== 'text' && body[mode] !== 'html') {
        throw new TypeError(`${mode} must be text or html`);
      }
      patch[mode] = body[mode];
    }
  }
  if (!Object.keys(patch).length) throw new TypeError('No info fields supplied');
  return patch;
}

export function infoFieldSet(body, fields, prefix) {
  return Object.fromEntries(
    Object.entries(parseInfoPatch(body, fields)).map(([key, value]) => [`${prefix}.${key}`, value]),
  );
}
