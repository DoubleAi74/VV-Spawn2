import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserByUsernameTag, getPageBySlug, getPostsByPage } from '@/lib/data';
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

  const serialisedUser = JSON.parse(JSON.stringify(user));
  const serialisedPage = JSON.parse(JSON.stringify(page));
  const serialisedPosts = JSON.parse(JSON.stringify(posts));

  return (
    <ThemeProvider
      initialDashHex={user.dashboard?.dashHex}
      initialBackHex={user.dashboard?.backHex}
      storageKey={user.usernameTag}
    >
      <PageViewClient
        user={serialisedUser}
        page={serialisedPage}
        initialPosts={serialisedPosts}
      />
    </ThemeProvider>
  );
}
