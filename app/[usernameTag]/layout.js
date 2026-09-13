import { notFound } from 'next/navigation';
import { resolveUsernameTag } from '@/lib/data';
import { isDocumentRequest } from '@/lib/isDocumentRequest';
import { toProfileShell } from '@/lib/profileShell';
import { ProfileShellProvider } from '@/context/ProfileShellContext';
import { SKIPS_SKELETON_ON_DOCUMENT } from '@/lib/loadingStrategy';

/**
 * Decides what `/{usernameTag}` *is* before anything renders — but only on a
 * document request. A flight already has `loading.js` on the client; awaiting
 * Mongo here is what made a back-navigation sit on the previous screen.
 *
 * On a document request this still lives in the layout, not the page, because
 * a `loading.js` Suspense boundary flushes the status line the moment the
 * page suspends. `notFound()` below that boundary answered 200. See LNK-3.
 */
export default async function UsernameTagLayout({ children, params }) {
  if (!(await isDocumentRequest())) return children;

  const { usernameTag } = await params;
  const { user } = await resolveUsernameTag(usernameTag);

  if (!user) notFound();

  // A stale tag is *not* redirected here, deliberately. This layout cannot see
  // the segments below it, so redirecting from here would send
  // `/{old-tag}/{old-slug}` to `/{new-tag}` and lose the page. Each route below
  // canonicalises the whole path it can see, in one hop.
  // Reuse the lookup above for the first paint, without waiting for the pages
  // or session. Flight navigation still takes the immediate path at the top.
  const shell = toProfileShell(user, usernameTag);
  return (
    <ProfileShellProvider value={shell}>
      {/* The loading watermark is the first thing either route paints. Fetched
          from CSS it starts only once the cover does, and streams in visibly. */}
      <link rel="preload" as="image" href="/vv-grey.webp" />
      {/* DOCUMENT_LOADING === 'skeleton': the live view streams in later with a
          cover up and its info frames at the 40px floor, because the server
          cannot see the snapshot the skeleton is already painting from. Read
          that snapshot here instead — before anything paints — and let the warm
          rules in globals.css keep what is already on screen. */}
      {SKIPS_SKELETON_ON_DOCUMENT ? null : (
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{
var p=location.pathname.split('/').filter(Boolean),tag=p[0],slug=p[1];
if(!tag)return;
var store=JSON.parse(sessionStorage.getItem(slug?'volvox:pageSnapshots':'volvox:dashSnapshots')||'{}');
var s=store[slug?tag+'/'+slug:tag];
if(!s||!(Date.now()-(+s.updatedAt||0)<=3600000))return;
var r=document.documentElement;
if(s.infoHeight1)r.style.setProperty('--warm-info-1',s.infoHeight1+'px');
if(s.infoHeight)r.style.setProperty('--warm-info-2',s.infoHeight+'px');
r.setAttribute('data-warm-route','');
}catch(e){}})();`,
        }}
      />
      )}
      <style
        dangerouslySetInnerHTML={{
          __html: `:root{--dash-hex:${shell.dashHex};--back-hex:${shell.backHex}}`,
        }}
      />
      {children}
    </ProfileShellProvider>
  );
}
