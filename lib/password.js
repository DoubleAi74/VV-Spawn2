/**
 * lib/password.js — one password policy, shared by the server routes that set
 * a password and by the login UI that has to explain it.
 *
 * Kept free of server-only imports so the client can use it: the signup and
 * reset forms import the same rule the API enforces, and cannot drift from it.
 */

export const MIN_PASSWORD_LENGTH = 8;

// One cost factor everywhere. Signup used to hash at 10 and reset at 12, so a
// user's protection silently depended on which path they last used.
export const BCRYPT_COST = 12;

/**
 * Returns a message describing what is wrong with a password, or null if it
 * is acceptable.
 */
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}
