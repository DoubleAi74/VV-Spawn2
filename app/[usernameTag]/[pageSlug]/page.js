import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import {
  getPostsByPage,
  resolvePageSlug,
  resolveUsernameTag,
  toPublicUser,
} from '@/lib/data';
import { buildMetadata, ogImages, toPlainDescription } from '@/lib/metadata';
import { sanitizeRichText } from '@/lib/sanitize';
import { ThemeProvider } from '@/context/ThemeContext';
import PageViewClient from '@/components/page/PageViewClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { usernameTag, pageSlug } = await params;
  const { user } = await resolveUsernameTag(usernameTag);
  if (!user) return { title: 'Not found' };

  const { page } = await resolvePageSlug(user._id, pageSlug);
  if (!page) return { title: 'Not found' };

  const owner = user.usernameTitle || user.usernameTag;
  const description = toPlainDescription(
    page.description || page.pageMetaData?.infoText2,
    `${page.title} — by ${owner} on Volvox Works.`
  );

  return buildMetadata({
    title: `${page.title} — ${owner}`,
    description,
    path: `/${user.usernameTag}/${page.slug}`,
    images: ogImages(page.thumbnail, page.title),
    // A private page 404s for everyone but its owner. Nothing should be
    // inviting a crawler to try it.
    noIndex: page.isPrivate,
  });
}

export default async function PageViewPage({ params }) {
  const { usernameTag, pageSlug } = await params;

  const [session, resolvedUser] = await Promise.all([
    auth(),
    resolveUsernameTag(usernameTag),
  ]);

  const user = resolvedUser.user;
  if (!user) notFound();

  // The layouts above have already settled both segments — a missing one is a
  // 404 and a renamed one is a 308, decided before this could suspend. Both
  // resolves are memoised, so these are the same two queries, not four.
  const resolvedPage = await resolvePageSlug(user._id, pageSlug);
  const page = resolvedPage.page;
  if (!page) notFound();

  const isOwner = session?.user?.usernameTag === user.usernameTag;

  // Private page: 404 for non-owners (BR-005, SEC-008)
  if (page.isPrivate && !isOwner) notFound();

  const posts = await getPostsByPage(page._id);

  // Only the public projection of the user crosses the boundary — client props
  // end up in the page HTML.
  const publicUser = toPublicUser(user, { isOwner });
  const serialisedPage = JSON.parse(JSON.stringify(page));
  // See toPublicUser: rich text is cleaned on the server so the browser never
  // has to load a sanitiser to display it.
  serialisedPage.pageMetaData = {
    ...serialisedPage.pageMetaData,
    infoText1: sanitizeRichText(serialisedPage.pageMetaData?.infoText1 || ''),
    infoText2: sanitizeRichText(serialisedPage.pageMetaData?.infoText2 || ''),
  };
  const serialisedPosts = JSON.parse(JSON.stringify(posts));

  return (
    <ThemeProvider
      initialDashHex={user.dashboard?.dashHex}
      initialBackHex={user.dashboard?.backHex}
      storageKey={user.usernameTag}
    >
      <PageViewClient
        user={publicUser}
        page={serialisedPage}
        initialPosts={serialisedPosts}
      />
    </ThemeProvider>
  );
}
