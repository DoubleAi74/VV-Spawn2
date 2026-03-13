import Link from 'next/link';
import { getAdminUserSummaries } from '@/lib/data';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin | Volvox Works',
  description: 'Public admin dashboard for account counts',
};

function numberLabel(value, singular, plural) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export default async function AdminPage() {
  const users = await getAdminUserSummaries();

  const totals = users.reduce(
    (acc, user) => {
      acc.users += 1;
      acc.pages += user.pageCount || 0;
      acc.posts += user.postCount || 0;
      return acc;
    },
    { users: 0, pages: 0, posts: 0 }
  );

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(64,96,112,0.34),transparent_42%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.08),transparent_36%)]" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-xl border border-white/10 bg-black/55 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-[2px]">
          <div className="h-[10px] w-full bg-[#406070]" />
          <div className="flex flex-col gap-6 px-6 py-7 sm:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">
                  Public Admin
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Volvox account overview
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-[15px]">
                  Every account, with direct links to the public dashboard and
                  live totals for pages and posts.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:min-w-[320px]">
                <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                    Users
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {totals.users}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                    Pages
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {totals.pages}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                    Posts
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {totals.posts}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-black/45 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-[2px]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-left text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                  <th className="px-5 py-4 font-medium sm:px-6">Account</th>
                  <th className="px-5 py-4 font-medium sm:px-6">Username</th>
                  <th className="px-5 py-4 font-medium sm:px-6">Pages</th>
                  <th className="px-5 py-4 font-medium sm:px-6">Posts</th>
                  <th className="px-5 py-4 font-medium sm:px-6">Open</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={String(user._id)}
                    className="border-b border-white/8 text-sm text-zinc-200 transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-4 align-middle sm:px-6">
                      <div className="font-medium text-white">
                        {user.usernameTitle}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-middle sm:px-6">
                      <div className="font-mono text-[13px] text-zinc-400">
                        @{user.usernameTag}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-middle sm:px-6">
                      <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-zinc-200">
                        {numberLabel(user.pageCount || 0, 'page', 'pages')}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-middle sm:px-6">
                      <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-zinc-200">
                        {numberLabel(user.postCount || 0, 'post', 'posts')}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-middle sm:px-6">
                      <Link
                        href={`/${user.usernameTag}`}
                        className="inline-flex items-center rounded-md border border-white/12 bg-[#f4f4f5] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#111214] transition-colors hover:bg-white"
                      >
                        Open dashboard
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-zinc-400">
              No user accounts found.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
