import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserByUsernameTag, getPagesByUser, toPublicUser } from '@/lib/data';
import { ThemeProvider } from '@/context/ThemeContext';
import DashboardViewClient from '@/components/dashboard/DashboardViewClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ params }) {
  const { usernameTag } = await params;
  const [session, user] = await Promise.all([
    auth(),
    getUserByUsernameTag(usernameTag),
  ]);

  if (!user) notFound();

  const isOwner = session?.user?.usernameTag === usernameTag;
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
      />
    </ThemeProvider>
  );
}
