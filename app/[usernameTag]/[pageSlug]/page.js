import { notFound, permanentRedirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import {
  getPostsByPage,
  resolvePageSlug,
  resolveUsernameTag,
  toPublicUser,
} from '@/lib/data';
import { buildMetadata, buildViewport, ogImages, toPlainDescription } from '@/lib/metadata';
import { normalizeInfoMode } from '@/lib/infoMode';
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

export async function generateViewport({ params }) {
  const { usernameTag } = await params;
  const { user } = await resolveUsernameTag(usernameTag);
  return buildViewport({ themeColor: user?.dashboard?.dashHex });
}

export default async function PageViewPage({ params }) {
  const { usernameTag, pageSlug } = await params;

  const [session, resolvedUser] = await Promise.all([
    auth(),
    resolveUsernameTag(usernameTag),
  ]);

  const user = resolvedUser.user;
  if (!user) notFound();

  const resolvedPage = await resolvePageSlug(user._id, pageSlug);
  const page = resolvedPage.page;
  if (!page) notFound();

  // Layouts skip this work on flights so loading.js can show immediately.
  // Client navigations still need one hop to the canonical address.
  if (resolvedUser.redirected || resolvedPage.redirected) {
    permanentRedirect(`/${user.usernameTag}/${page.slug}`);
  }

  const isOwner = session?.user?.usernameTag === user.usernameTag;

  // Private page: 404 for non-owners (BR-005, SEC-008)
  if (page.isPrivate && !isOwner) notFound();

  const posts = await getPostsByPage(page._id);

  // Only the public projection of the user crosses the boundary — client props
  // end up in the page HTML.
  const publicUser = toPublicUser(user, { isOwner });
  const serialisedPage = JSON.parse(JSON.stringify(page));
  const infoMode = normalizeInfoMode(
    serialisedPage.pageMetaData?.infoMode,
    serialisedPage.pageMetaData?.infoText2 || '',
  );
  const infoMode1 = normalizeInfoMode(
    serialisedPage.pageMetaData?.infoMode1,
    serialisedPage.pageMetaData?.infoText1 || '',
  );
  serialisedPage.pageMetaData = {
    ...serialisedPage.pageMetaData,
    infoMode,
    infoMode1,
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
        isOwner={isOwner}
      />
    </ThemeProvider>
  );
}
