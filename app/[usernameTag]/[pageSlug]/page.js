import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserByUsernameTag, getPageBySlug, getPostsByPage, toPublicUser } from '@/lib/data';
import { sanitizeRichText } from '@/lib/sanitize';
import { ThemeProvider } from '@/context/ThemeContext';
import PageViewClient from '@/components/page/PageViewClient';

export const dynamic = 'force-dynamic';

export default async function PageViewPage({ params }) {
  const { usernameTag, pageSlug } = await params;

  const [session, user] = await Promise.all([
    auth(),
    getUserByUsernameTag(usernameTag),
  ]);

  if (!user) notFound();

  const page = await getPageBySlug(user._id, pageSlug);
  if (!page) notFound();

  const isOwner = session?.user?.usernameTag === usernameTag;

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
