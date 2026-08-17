import { Suspense } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPagesByUser, resolveUsernameTag, toPublicUser } from '@/lib/data';
import { buildMetadata, ogImages, toPlainDescription } from '@/lib/metadata';
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

/**
 * Everything below the point where the status is decided.
 *
 * `app/[usernameTag]/layout.js` has already resolved the tag, so by the time
 * this suspends the response is definitely a 200 and the shell can flush
 * behind the skeleton. This is where `app/[usernameTag]/loading.js` used to
 * sit; `components/dashboard/DashboardSkeleton.js` records why it had to move.
 */
async function DashboardBody({ usernameTag }) {
  const [session, { user }] = await Promise.all([
    auth(),
    resolveUsernameTag(usernameTag),
  ]);

  if (!user) notFound();

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
      <DashboardViewClient user={publicUser} initialPages={serialisedPages} />
    </ThemeProvider>
  );
}

export default async function DashboardPage({ params }) {
  const { usernameTag } = await params;

  // Before the Suspense boundary below exists, so the status is still the
  // server's to set. The tag reached this account through a rename: 308 to the
  // current address, so a link shared before the rename still arrives.
  const { user, redirected } = await resolveUsernameTag(usernameTag);
  if (!user) notFound();
  if (redirected) permanentRedirect(`/${user.usernameTag}`);

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardBody usernameTag={usernameTag} />
    </Suspense>
  );
}
