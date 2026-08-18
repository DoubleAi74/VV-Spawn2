import { Suspense } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPagesByUser, resolveUsernameTag, toPublicUser } from '@/lib/data';
import { buildMetadata, buildViewport, ogImages, toPlainDescription } from '@/lib/metadata';
import { ThemeProvider } from '@/context/ThemeContext';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import DashboardViewClient from '@/components/dashboard/DashboardViewClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { usernameTag } = await params;
  const { user } = await resolveUsernameTag(usernameTag);
  if (!user) return { title: 'Not found' };

  const title = user.usernameTitle || user.usernameTag;
  // The first public page's thumbnail is the only image a profile has; a
  // profile with nothing public gets a card with no image rather than one
  // advertising a page it will not show.
  const [firstPublicPage] = await getPagesByUser(user._id, false);

  return buildMetadata({
    title: `${title} — Volvox Works`,
    description: toPlainDescription(
      user.dashboard?.infoText,
      `Works by ${title}.`
    ),
    path: `/${user.usernameTag}`,
    images: ogImages(firstPublicPage?.thumbnail, firstPublicPage?.title),
  });
}

export async function generateViewport({ params }) {
  const { usernameTag } = await params;
  const { user } = await resolveUsernameTag(usernameTag);
  return buildViewport({ themeColor: user?.dashboard?.dashHex });
}

async function DashboardBody({ usernameTag }) {
  const [session, resolved] = await Promise.all([
    auth(),
    resolveUsernameTag(usernameTag),
  ]);

  const user = resolved.user;
  if (!user) notFound();
  if (resolved.redirected) permanentRedirect(`/${user.usernameTag}`);

  const isOwner = session?.user?.usernameTag === user.usernameTag;
  const pages = await getPagesByUser(user._id, isOwner);

  // Serialise MongoDB documents for the client. Only the public projection of
  // the user crosses the boundary — client props end up in the page HTML.
  const publicUser = toPublicUser(user, { isOwner });
  const serialisedPages = JSON.parse(JSON.stringify(pages));

  return (
    <ThemeProvider
      initialDashHex={user.dashboard?.dashHex}
      initialBackHex={user.dashboard?.backHex}
      storageKey={user.usernameTag}
    >
      <DashboardViewClient
        user={publicUser}
        initialPages={serialisedPages}
        isOwner={isOwner}
      />
    </ThemeProvider>
  );
}

export default async function DashboardPage({ params }) {
  const { usernameTag } = await params;

  // Return the boundary immediately so a back-navigation can paint the
  // snapshot skeleton without a parent `loading.js` (that file also wraps
  // child routes and was flashing on the way *into* a page).
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardBody usernameTag={usernameTag} />
    </Suspense>
  );
}
