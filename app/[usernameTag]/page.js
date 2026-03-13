import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getUserByUsernameTag, getPagesByUser } from '@/lib/data';
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

  // Serialise MongoDB documents for the client
  const serialisedUser = JSON.parse(JSON.stringify(user));
  const serialisedPages = JSON.parse(JSON.stringify(pages));

  return (
    <ThemeProvider
      initialDashHex={user.dashboard?.dashHex}
      initialBackHex={user.dashboard?.backHex}
      storageKey={user.usernameTag}
    >
      <DashboardViewClient
        user={serialisedUser}
        initialPages={serialisedPages}
      />
    </ThemeProvider>
  );
}
