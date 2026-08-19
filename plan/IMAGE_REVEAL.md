# Image reveal — hide until decoded

**Do not start coding until this is approved.** Work only in `VV-Main/`. Do not expand the scope.

Same decoder flash as the edit-modal thumbnail: Firefox paints unread JPEG/WebP rows as white; Chrome draws top-to-bottom; Safari waits. The modal now hides the `<img>` until `load`. Cards and the login background still let an incomplete bitmap show, rarely (~3%), when the file is not already in the decoder cache.

Normal visits must look the same: no spinner on the grid or the login hero. The stand-in that is already there (card blur / grey, login black) stays until the photo is whole.

---

## 1. Cards — `ImageWithLoader`

**File:** `components/ImageWithLoader.js` (used by page cards, post cards, skeletons).

Today, if `loadedSrcCache` already has the URL, the next `<img>` mounts **fully visible**. That set only means “we have seen this URL this tab,” not “the pixels are in the decoder.” After a remount (navigate away and back, a 304 that still has to decode, memory pressure) the image is opaque while it paints. That is the rare flash.

**Change**

- Always start the `<img>` invisible (`opacity-0`).
- If the element is already `complete` with `naturalWidth > 0`, flip to visible in the **same frame** (callback ref, same pattern as `ThumbnailPreview`). No fade.
- Run the existing 300ms fade only when it was actually still loading.
- `loadedSrcCache` may still skip the *animation*, not the hide.
- Keep the parent blur / `#cccccc` underneath. No spinner on cards.

**Do not** change `lib/ordering.js`, Cloudflare buckets, or `format=webp`.

---

## 2. Login background — `AuthChrome`

**File:** `app/login/AuthChrome.js`.

The photo is a CSS `background-image` (`/background-800.webp` / `/background-1920.webp`). There is no load event. On a cache miss the layer paints as the file arrives, on top of `bg-black`.

**Change**

- Replace those `background-image` divs with absolutely filled `<img>`s (`object-cover`, same two files, same `md:` split).
- `opacity-0` until `onLoad` (and the cached-`complete` ref check). Then show at once — no fade, no spinner.
- Empty `alt` (decorative; `aria-hidden` already on the layer).
- The page stays `bg-black` until the photo is ready.

Optional and small, same pass: `<link rel="preload" as="image">` in the login layout for the desktop file (and the 800 file if easy). Shrinks the miss rate; does not change a cached visit.

---

## 3. Out of scope

- Spinners on cards or the login hero (modal 64px preview only).
- Changing encode settings or Cloudflare transforms.
- Lightbox / other raw `<img>`s unless they share this component.
- Safari-only hacks.

---

## 4. Done when

- Cold login (disabled cache): black, then the whole photo. No white band, no top-to-bottom wipe.
- Cached login: still an immediate full photo (same-frame complete check).
- Cards after a dashboard ↔ page hop: blur/grey, then the whole thumb, never a white scan. The usual fade still runs on a first-ever load of that URL in the tab.
- `npx next lint` clean on the touched files.

Verify in Firefox if you can (that is where the white is obvious). Chrome is enough to confirm hide-until-complete.
