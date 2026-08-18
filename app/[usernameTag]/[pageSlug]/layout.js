/**
 * Must stay synchronous and must not await. An async layout in this segment
 * suspends *outside* `loading.js`, and the parent Suspense used to catch that
 * as the dashboard skeleton — the flash on a card click. 404/308 live in
 * `page.js`; the username layout still 404s unknown profiles on document
 * requests.
 */
export default function PageSlugLayout({ children }) {
  return children;
}
