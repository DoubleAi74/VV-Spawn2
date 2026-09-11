import { normalizeHex } from './colour.js';

/** Only these public fields may seed the loading UI before auth has resolved. */
export function toProfileShell(user, usernameTag) {
  return {
    usernameTag,
    usernameTitle: user.usernameTitle || user.usernameTag,
    dashHex: normalizeHex(user.dashboard?.dashHex, '#2d3e50'),
    backHex: normalizeHex(user.dashboard?.backHex, '#e5e7eb'),
  };
}
